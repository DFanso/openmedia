//! The second redaction pass. The page script already filters, but the page is hostile and its
//! script may be buggy, so everything that can leave the device is re-checked here against
//! allow-lists. Anything that does not pass is dropped, not rewritten.

use std::{collections::HashSet, sync::LazyLock};

use regex::{Captures, Regex};

use super::snapshot::{Node, Snapshot, clean, node_line, valid_tag};

/// Upper bound for [`Snapshot::to_text`] after redaction.
pub const MAX_SNAPSHOT_BYTES: usize = 40 * 1024;

const MAX_CLASSES: usize = 4;
const MAX_DATA: usize = 8;
const MAX_TEXT_CHARS: usize = 40;
const MAX_LABEL_CHARS: usize = 60;

const TEXT_TAGS: [&str; 10] = [
    "a", "button", "h1", "h2", "h3", "h4", "h5", "h6", "summary", "label",
];
const FLAGS: [&str; 3] = ["fixed", "sticky", "overlay"];
const STABLE_DATA: [&str; 7] = [
    "data-testid",
    "data-e2e",
    "data-pagelet",
    "data-test-selector",
    "data-interaction",
    "data-click-id",
    "data-component",
];

fn re(pattern: &str) -> Regex {
    // The patterns below are constants covered by tests; a failure is a programming error.
    Regex::new(pattern).unwrap_or_else(|_| unreachable!("invalid built-in pattern {pattern}"))
}

static QUERY: LazyLock<Regex> = LazyLock::new(|| re(r"(\S)\?\S+"));
static EMAIL: LazyLock<Regex> =
    LazyLock::new(|| re(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}"));
static KNOWN_TOKEN: LazyLock<Regex> = LazyLock::new(|| {
    re(
        r"eyJ[\w\-]+\.[\w\-]+\.[\w\-]+|\b(?:sk|pk|rk|ghp|gho|ghu|ghs|xox[abprs]|AKIA|AIza|glpat)[\-_]?[A-Za-z0-9_\-]{8,}",
    )
});
static LONG_WORD: LazyLock<Regex> = LazyLock::new(|| re(r"[A-Za-z0-9_\-+=]{20,}"));
static PHONE: LazyLock<Regex> = LazyLock::new(|| re(r"\+?\d[\d ()\-.]{5,}\d"));
static DIGITS: LazyLock<Regex> = LazyLock::new(|| re(r"\d{6,}"));
static HEX_RUN: LazyLock<Regex> = LazyLock::new(|| re(r"[0-9a-fA-F]{8,}"));
static HEX_LONG: LazyLock<Regex> = LazyLock::new(|| re(r"[0-9a-fA-F]{12,}"));
static ROLE: LazyLock<Regex> = LazyLock::new(|| re(r"^[a-z-]{1,30}$"));
static ID: LazyLock<Regex> = LazyLock::new(|| re(r"^[A-Za-z][A-Za-z0-9_-]{0,31}$"));
static DATA_NAME: LazyLock<Regex> = LazyLock::new(|| re(r"^data-[a-z0-9-]{1,40}$"));
static CLASS: LazyLock<Regex> =
    LazyLock::new(|| re(r"^[A-Za-z][A-Za-z0-9]*(?:[-_]+[A-Za-z0-9]+)+$"));
static CLASS_SUFFIX: LazyLock<Regex> = LazyLock::new(|| re(r"_([A-Za-z0-9]{5,})$"));
static CLASS_NOISE: LazyLock<Regex> = LazyLock::new(|| {
    re(
        r"(?i)^(?:text|bg|px|py|pt|pb|pl|pr|p|m|mx|my|mt|mb|ml|mr|w|h|min|max|flex|grid|gap|items|justify|self|border|rounded|font|leading|tracking|shadow|z|top|left|right|bottom|inset|space|overflow|opacity|cursor|hover|focus|sm|md|lg|xl|css|r|jsx|sc|emotion|chakra|svelte|wbloks|tw)[-_]",
    )
});
static SENSITIVE_NAME: LazyLock<Regex> = LazyLock::new(|| {
    re(r"(?i)(token|secret|key|auth|session|email|phone|user|pass|csrf|nonce|sig)")
});
static HREF: LazyLock<Regex> =
    LazyLock::new(|| re(r"^(?:/\S*|//[a-z0-9.\-]{1,80}|[a-z][a-z0-9+.\-]{0,20}:(?://)?)$"));

/// Replaces anything in free text that looks like personal data or a credential with a
/// placeholder: URL query strings, e-mail addresses, known token shapes, long opaque words, phone
/// numbers and long digit runs.
pub fn scrub_text(text: &str) -> String {
    let text = QUERY.replace_all(text, "$1");
    let text = EMAIL.replace_all(&text, "[email]");
    let text = KNOWN_TOKEN.replace_all(&text, "[token]");
    let text = HEX_LONG.replace_all(&text, |caps: &Captures| {
        if caps[0].chars().all(|c| c.is_ascii_digit()) {
            caps[0].to_owned()
        } else {
            "[token]".to_owned()
        }
    });
    let text = LONG_WORD.replace_all(&text, |caps: &Captures| {
        if looks_like_token(&caps[0]) {
            "[token]".to_owned()
        } else {
            caps[0].to_owned()
        }
    });
    let text = PHONE.replace_all(&text, |caps: &Captures| {
        let digits = caps[0].chars().filter(char::is_ascii_digit).count();
        if digits == caps[0].len() && digits >= 6 {
            "[number]".to_owned()
        } else if digits >= 7 {
            "[phone]".to_owned()
        } else {
            caps[0].to_owned()
        }
    });
    DIGITS.replace_all(&text, "[number]").into_owned()
}

fn looks_like_token(word: &str) -> bool {
    let has = |f: fn(&char) -> bool| word.chars().any(|c| f(&c));
    let digit = has(char::is_ascii_digit);
    let letter = has(char::is_ascii_alphabetic);
    let mixed_case = has(char::is_ascii_uppercase) && has(char::is_ascii_lowercase);
    (digit && letter)
        || (word.len() >= 24 && mixed_case && !word.contains(['-', '_']))
        || HEX_RUN.is_match(word)
}

/// A path with no query or fragment, no long numbers and no token-looking segments.
pub fn scrub_path(path: &str) -> String {
    let cut = path.split(['?', '#']).next().unwrap_or("");
    scrub_text(&clean(cut, 200))
}

fn generated_name(name: &str) -> bool {
    let digits = name.chars().filter(char::is_ascii_digit).count();
    digits >= 3
        || (name.len() >= 6
            && name
                .chars()
                .all(|c| c.is_ascii_hexdigit() || c == '-' || c == '_'))
}

fn stable_id(id: &str) -> bool {
    ID.is_match(id) && !generated_name(id)
}

/// A class name that a person wrote, as opposed to a hash, a utility class or a framework prefix.
/// A trailing `_hash` is replaced with `*`.
pub(crate) fn class_name(raw: &str) -> Option<String> {
    let (base, star) = match CLASS_SUFFIX.captures(raw) {
        Some(caps) => {
            let suffix = &caps[1];
            let hashy = suffix.chars().any(|c| c.is_ascii_digit())
                || suffix
                    .as_bytes()
                    .windows(2)
                    .any(|w| w[0].is_ascii_lowercase() && w[1].is_ascii_uppercase());
            if hashy {
                (raw[..raw.len() - caps[0].len()].trim_end_matches('_'), "*")
            } else {
                (raw, "")
            }
        }
        None => (raw, ""),
    };
    if !(6..=40).contains(&base.len())
        || !CLASS.is_match(base)
        || CLASS_NOISE.is_match(base)
        || generated_name(base)
    {
        return None;
    }
    let opaque_part = |part: &str| {
        part.len() >= 5
            && part.chars().any(|c| c.is_ascii_digit())
            && part.chars().any(|c| c.is_ascii_alphabetic())
    };
    if base.split(['-', '_']).any(opaque_part) {
        return None;
    }
    Some(format!("{base}{star}"))
}

fn data_value(name: &str, value: &str) -> String {
    let limit = if STABLE_DATA.contains(&name) { 40 } else { 24 };
    let plain = value
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || " .:/-_".contains(c));
    let opaque = HEX_RUN.is_match(&value.replace(['-', '_'], ""))
        || DIGITS.is_match(value)
        || value.chars().filter(char::is_ascii_digit).count() >= 5;
    if value.chars().count() > limit || !plain || opaque || SENSITIVE_NAME.is_match(name) {
        return String::new();
    }
    scrub_text(value)
}

fn href_ok(href: &str) -> Option<String> {
    let cut = href.split(['?', '#']).next().unwrap_or("");
    if cut.len() > 80 || !HREF.is_match(cut) {
        return None;
    }
    Some(scrub_text(cut))
}

fn text_allowed(node: &Node) -> bool {
    let tag = node.tag.rsplit('>').next().unwrap_or("");
    TEXT_TAGS.contains(&tag) || node.role.is_some()
}

fn redact_node(node: &mut Node) {
    node.tag.truncate(200);
    if !valid_tag(&node.tag) {
        node.tag = "div".to_owned();
    }
    node.role = node.role.take().filter(|role| ROLE.is_match(role));
    node.label = node
        .label
        .take()
        .map(|label| scrub_text(&label))
        .filter(|label| !label.is_empty() && label.chars().count() <= MAX_LABEL_CHARS);
    node.id = node.id.take().filter(|id| stable_id(id));
    node.href = node.href.take().and_then(|href| href_ok(&href));
    let allowed_text = text_allowed(node);
    node.text = node
        .text
        .take()
        .filter(|_| allowed_text)
        .map(|text| scrub_text(&text))
        .filter(|text| !text.is_empty() && text.chars().count() <= MAX_TEXT_CHARS);

    let mut data = Vec::new();
    for (name, value) in std::mem::take(&mut node.data) {
        let listed = STABLE_DATA.contains(&name.as_str());
        let acceptable = DATA_NAME.is_match(&name)
            && !SENSITIVE_NAME.is_match(&name)
            && (listed || !generated_name(&name[5..]));
        if acceptable && data.len() < MAX_DATA && !data.iter().any(|(seen, _)| *seen == name) {
            let value = data_value(&name, &value);
            data.push((name, value));
        }
    }
    node.data = data;

    let mut classes: Vec<String> = Vec::new();
    for class in std::mem::take(&mut node.classes) {
        if let Some(class) = class_name(class.trim_end_matches('*'))
            && classes.len() < MAX_CLASSES
            && !classes.contains(&class)
        {
            classes.push(class);
        }
    }
    node.classes = classes;
    node.flags.retain(|flag| FLAGS.contains(&flag.as_str()));
    node.flags.dedup();
    for child in &mut node.children {
        redact_node(child);
    }
}

/// Applies the allow-lists to every field, then trims the tree until its text is at most
/// [`MAX_SNAPSHOT_BYTES`].
pub fn redact(snapshot: &mut Snapshot) {
    snapshot.host = snapshot
        .host
        .chars()
        .take_while(|c| c.is_ascii_alphanumeric() || *c == '.' || *c == '-')
        .take(100)
        .collect();
    snapshot.path = scrub_path(&snapshot.path);
    redact_node(&mut snapshot.root);
    fit(snapshot, MAX_SNAPSHOT_BYTES);
}

/// Keeps the nodes nearest the root (breadth first) while the text stays within `limit`; every
/// dropped subtree is counted on its parent.
fn fit(snapshot: &mut Snapshot, limit: usize) {
    if snapshot.to_text().len() <= limit {
        return;
    }
    snapshot.truncated = true;
    let original = snapshot.root.clone();
    let header = snapshot
        .to_text()
        .lines()
        .next()
        .map_or(0, |line| line.len() + 1);
    let mut budget = limit.saturating_sub(header);
    // Dropped subtrees add a short note to their parent, so tighten until the text really fits.
    for _ in 0..12 {
        snapshot.root = original.clone();
        let keep = admit(&snapshot.root, budget);
        prune(&mut snapshot.root, &mut Vec::new(), &keep);
        if snapshot.to_text().len() <= limit {
            return;
        }
        budget = budget * 9 / 10;
    }
    snapshot.root.children.clear();
}

/// Paths (child indices from the root) of the nodes that fit in `budget` bytes, breadth first.
fn admit(root: &Node, mut budget: usize) -> HashSet<Vec<usize>> {
    let mut keep = HashSet::from([Vec::new()]);
    let mut level: Vec<(Vec<usize>, &Node)> = vec![(Vec::new(), root)];
    while !level.is_empty() {
        let mut next = Vec::new();
        for (path, node) in level {
            for (index, child) in node.children.iter().enumerate() {
                let cost = (path.len() + 1) * 2 + node_line(child).len() + 1;
                if budget < cost {
                    continue;
                }
                budget -= cost;
                let mut child_path = path.clone();
                child_path.push(index);
                keep.insert(child_path.clone());
                next.push((child_path, child));
            }
        }
        level = next;
    }
    keep
}

fn prune(node: &mut Node, path: &mut Vec<usize>, keep: &HashSet<Vec<usize>>) {
    let before = node.children.len();
    let mut kept = Vec::new();
    for (index, mut child) in std::mem::take(&mut node.children).into_iter().enumerate() {
        path.push(index);
        if keep.contains(path) {
            prune(&mut child, path, keep);
            kept.push(child);
        }
        path.pop();
    }
    node.elided = node.elided.saturating_add((before - kept.len()) as u32);
    node.children = kept;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::snapshot::{fixtures::YOUTUBE_LIKE, parse_snapshot};

    /// A tiny deterministic generator so the property-style tests need no dependency.
    struct Lcg(u64);
    impl Lcg {
        fn next(&mut self) -> u64 {
            self.0 = self
                .0
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            self.0 >> 33
        }
        fn pick<'a>(&mut self, items: &[&'a str]) -> &'a str {
            items[self.next() as usize % items.len()]
        }
        fn string(&mut self, alphabet: &str, len: usize) -> String {
            let chars: Vec<char> = alphabet.chars().collect();
            (0..len)
                .map(|_| chars[self.next() as usize % chars.len()])
                .collect()
        }
        fn digits(&mut self, len: usize) -> String {
            format!(
                "{}{}",
                1 + self.next() % 9,
                self.string("0123456789", len - 1)
            )
        }
    }

    const FRAMES: [&str; 6] = [
        "{}",
        "Contact {} now",
        "see ({}).",
        "a {} b",
        "x:{}",
        "\"{}\"",
    ];

    fn framed(rng: &mut Lcg, secret: &str) -> String {
        rng.pick(&FRAMES).replace("{}", secret)
    }

    #[test]
    fn sensitive_patterns_never_survive_scrubbing() {
        let mut rng = Lcg(7);
        for _ in 0..400 {
            let n = 3 + rng.next() as usize % 8;
            let user = rng.string("abcdefghijklmnopqrstuvwxyz0123456789.", n);
            let email = format!(
                "{user}@{}.{}",
                rng.string("abcdefghij", 6),
                rng.pick(&["com", "co.uk", "io"])
            );
            let n = 6 + rng.next() as usize % 10;
            let digits = rng.digits(n);
            let phone = format!(
                "+{} ({}) {}-{}",
                rng.digits(2),
                rng.digits(3),
                rng.digits(3),
                rng.digits(4)
            );
            let token = format!("{}{}", rng.string("abcdefXYZ", 12), rng.digits(12));
            let n = 16 + rng.next() as usize % 16;
            let hex = rng.string("0123456789abcdef", n);
            let jwt = format!(
                "eyJ{}.{}.{}",
                rng.string("abcdefgh", 12),
                rng.string("abcdefgh", 12),
                rng.string("abcdefgh", 12)
            );
            let query = format!(
                "https://x.test/p?token={}&uid={}",
                rng.string("abcdef", 8),
                rng.digits(8)
            );
            for secret in [&email, &digits, &phone, &token, &hex, &jwt] {
                let out = scrub_text(&framed(&mut rng, secret));
                assert!(!out.contains(secret.as_str()), "{secret} survived in {out}");
            }
            let out = scrub_text(&query);
            assert!(
                !out.contains("token=") && !out.contains("uid=") && !out.contains('?'),
                "{out}"
            );
            // No run of six digits is left in any output.
            for secret in [&email, &digits, &phone, &token] {
                let out = scrub_text(secret);
                assert!(!DIGITS.is_match(&out), "{out}");
            }
        }
    }

    #[test]
    fn ordinary_ui_text_is_left_alone() {
        for text in [
            "Open app",
            "Reels",
            "Suggested for you",
            "Sign in",
            "Notifications (3)",
            "Home",
        ] {
            assert_eq!(scrub_text(text), text);
        }
    }

    #[test]
    fn hrefs_keep_a_path_a_host_or_a_scheme_and_nothing_else() {
        assert_eq!(href_ok("/reels/?igsh=abc123"), Some("/reels/".into()));
        assert_eq!(
            href_ok("//play.google.com"),
            Some("//play.google.com".into())
        );
        assert_eq!(href_ok("vnd.youtube://"), Some("vnd.youtube://".into()));
        assert_eq!(
            href_ok("/u/1234567890123/posts"),
            Some("/u/[number]/posts".into())
        );
        assert_eq!(
            href_ok("/c/AbCdEfGhIjKlMnOpQrStUvWxYz"),
            Some("/c/[token]".into())
        );
        for bad in [
            "javascript:alert(1)",
            "https://a.com/x?y=1",
            "not a path",
            "data:text/html,x",
        ] {
            assert!(href_ok(bad).is_none(), "{bad}");
        }
        assert!(href_ok(&format!("/{}", "a".repeat(100))).is_none());
    }

    #[test]
    fn class_names_are_never_hashes_or_utilities() {
        for kept in [
            "pivot-shorts",
            "related-items-container",
            "rich-grid-renderer-contents",
        ] {
            assert_eq!(class_name(kept).as_deref(), Some(kept));
        }
        assert_eq!(
            class_name("Header_title__a1B2c").as_deref(),
            Some("Header_title*")
        );
        assert_eq!(class_name("Feed_item_xYz12").as_deref(), Some("Feed_item*"));
        for dropped in [
            "x1i10hfl",
            "css-175oi2r",
            "r-1awozwy",
            "flex",
            "px-4",
            "text-sm",
            "wbloks_1",
            "a1b2c3d4e5",
            "bg-gray-100",
            "_a8f3b9c0",
            "Foo bar",
        ] {
            assert!(class_name(dropped).is_none(), "{dropped}");
        }
    }

    #[test]
    fn redact_applies_allow_lists_to_a_hostile_snapshot() {
        let json = r#"{"v":1,"host":"evil.com/<x>","path":"/p?secret=1#frag","w":390,"vw":"phone","root":{"t":"body","k":[
          {"t":"div","i":"a1b2c3d4e5f6","c":["css-175oi2r","sidebar-promo"],"x":"visible text on a div","f":["fixed","evil"],
           "d":[["data-testid","promo"],["data-session-id","abc"],["data-v-7ba5bd90","x"],["data-foo","0123456789abcdef"],["data-bar","ok"]],
           "k":[{"t":"a","h":"/x?token=abc","x":"mail me at a@b.com","l":"call +1 (555) 123-4567"}]},
          {"t":"div","i":"main-menu","r":"not a role!","x":"hello"}]}}"#;
        let mut snap = parse_snapshot(json).unwrap();
        redact(&mut snap);
        assert_eq!(snap.host, "evil.com");
        assert_eq!(snap.path, "/p");
        let div = &snap.root.children[0];
        assert!(div.id.is_none());
        assert_eq!(div.classes, ["sidebar-promo"]);
        assert!(div.text.is_none(), "plain divs carry no text");
        assert_eq!(div.flags, ["fixed"]);
        let names: Vec<&str> = div.data.iter().map(|(n, _)| n.as_str()).collect();
        assert_eq!(names, ["data-testid", "data-foo", "data-bar"]);
        assert_eq!(div.data[0].1, "promo");
        assert_eq!(div.data[1].1, "", "hex-looking value withheld");
        assert_eq!(div.data[2].1, "ok");
        let link = &div.children[0];
        assert_eq!(link.href.as_deref(), Some("/x"));
        assert_eq!(link.text.as_deref(), Some("mail me at [email]"));
        assert_eq!(link.label.as_deref(), Some("call [phone]"));
        let menu = &snap.root.children[1];
        assert_eq!(menu.id.as_deref(), Some("main-menu"));
        assert!(menu.role.is_none() && menu.text.is_none());
    }

    #[test]
    fn the_whole_snapshot_text_is_capped() {
        let mut kids = String::new();
        for i in 0..650 {
            kids.push_str(&format!(
                r#"{}{{"t":"section","c":["feed-card-wrapper"],"d":[["data-testid","card-{i}-padding-x"]],"l":"{}","k":[{{"t":"a","h":"/watch/{}","x":"title {i}"}}]}}"#,
                if i == 0 { "" } else { "," },
                "label ".repeat(9),
                "v".repeat(40),
            ));
        }
        let json = format!(
            r#"{{"v":1,"host":"a.com","path":"/","vw":"desktop","w":1200,"root":{{"t":"main","k":[{kids}]}}}}"#
        );
        let mut snap = parse_snapshot(&json).unwrap();
        let before = snap.to_text().len();
        assert!(
            before > MAX_SNAPSHOT_BYTES,
            "fixture must exceed the cap, was {before}"
        );
        redact(&mut snap);
        let text = snap.to_text();
        assert!(text.len() <= MAX_SNAPSHOT_BYTES, "{}", text.len());
        assert!(snap.truncated && snap.root.elided > 0);
        assert!(text.starts_with("page: a.com /"));
        assert!(snap.root.children.len() > 50, "breadth is kept");
    }

    #[test]
    fn redaction_is_idempotent_and_output_has_no_secrets() {
        let mut snap = parse_snapshot(YOUTUBE_LIKE).unwrap();
        redact(&mut snap);
        let once = snap.to_text();
        redact(&mut snap);
        assert_eq!(snap.to_text(), once);
        assert!(once.contains("related-items-container"));
    }
}
