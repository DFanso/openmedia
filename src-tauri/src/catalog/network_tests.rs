//! Catalog behaviour against a canned server on a loopback port: no real network, no Cloudflare.

use std::{
    collections::BTreeMap,
    io::{Read, Write},
    net::TcpListener,
    path::Path,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
    thread::JoinHandle,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use base64::{Engine, engine::general_purpose::STANDARD};

use super::index::{Index, TAG_OFFICIAL, sha256_hex, sign};
use super::*;
use crate::library::Library;

const KEY_ID: &str = "k1";
const PRO_USER: &str = "$RCAnonymousID:0123456789abcdef";
const COMMENT_ID: &str = "123e4567-e89b-12d3-a456-426614174000";

struct FakeAccount {
    pro: bool,
    user: Option<&'static str>,
    id_reads: AtomicUsize,
}

impl FakeAccount {
    fn new(pro: bool, user: Option<&'static str>) -> Self {
        Self {
            pro,
            user,
            id_reads: AtomicUsize::new(0),
        }
    }
}

impl Account for FakeAccount {
    fn require_pro(&self) -> Result<()> {
        if self.pro {
            Ok(())
        } else {
            Err(Error::ProRequired)
        }
    }

    fn app_user_id(&self) -> Result<Option<String>> {
        self.id_reads.fetch_add(1, Ordering::SeqCst);
        Ok(self.user.map(str::to_owned))
    }
}

/// What the server saw: `METHOD /path`, lower-cased headers, then the body.
type Hits = Arc<Mutex<Vec<String>>>;

struct Server {
    port: u16,
    hits: Hits,
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl Server {
    /// `routes` maps `"GET /v1/x"` to `(status, body)`; anything else is a 404.
    fn start(routes: BTreeMap<String, (u16, Vec<u8>)>) -> Self {
        let routes: BTreeMap<String, (u16, Vec<u8>)> = routes
            .into_iter()
            .map(|(key, answer)| (key.to_ascii_lowercase(), answer))
            .collect();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let port = listener.local_addr().unwrap().port();
        let hits: Hits = Arc::default();
        let stop = Arc::new(AtomicBool::new(false));
        let (seen, stopped) = (hits.clone(), stop.clone());
        let thread = std::thread::spawn(move || {
            while !stopped.load(Ordering::SeqCst) {
                let Ok((mut stream, _)) = listener.accept() else {
                    std::thread::sleep(Duration::from_millis(2));
                    continue;
                };
                stream.set_nonblocking(false).unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .unwrap();
                let request = read_request(&mut stream);
                let line = request.lines().next().unwrap_or_default();
                let key = line.split(' ').take(2).collect::<Vec<_>>().join(" ");
                seen.lock().unwrap().push(request.clone());
                let (status, body) = routes.get(&key).cloned().unwrap_or((404, Vec::new()));
                let head = format!(
                    "HTTP/1.1 {status} X\r\ncontent-length: {}\r\nconnection: close\r\n\r\n",
                    body.len()
                );
                let _ = stream.write_all(head.as_bytes());
                let _ = stream.write_all(&body);
            }
        });
        Self {
            port,
            hits,
            stop,
            thread: Some(thread),
        }
    }

    fn url(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }

    fn hits(&self) -> Vec<String> {
        self.hits.lock().unwrap().clone()
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

fn read_request(stream: &mut std::net::TcpStream) -> String {
    let mut received = Vec::new();
    let mut chunk = [0_u8; 4096];
    loop {
        let read = stream.read(&mut chunk).unwrap_or(0);
        received.extend_from_slice(&chunk[..read]);
        let text = String::from_utf8_lossy(&received).into_owned();
        if let Some((head, rest)) = text.split_once("\r\n\r\n") {
            let wanted = head
                .lines()
                .find_map(|line| {
                    line.to_ascii_lowercase()
                        .strip_prefix("content-length:")
                        .and_then(|n| n.trim().parse::<usize>().ok())
                })
                .unwrap_or(0);
            if rest.len() >= wanted {
                return format!("{}\r\n\r\n{rest}", head.to_ascii_lowercase());
            }
        }
        if read == 0 {
            return text;
        }
    }
}

fn now_secs() -> i64 {
    i64::try_from(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs(),
    )
    .unwrap()
}

fn official_file(site: &str) -> Vec<u8> {
    std::fs::read(
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../recipes/official")
            .join(format!("{site}.json")),
    )
    .unwrap()
}

/// Routes for a signed catalog of these official recipes. `broken` ones are listed but their
/// file is not served.
fn catalog_routes(sites: &[&str], broken: &[&str]) -> (BTreeMap<String, (u16, Vec<u8>)>, String) {
    let (pkcs8, public) = index::generate_key().unwrap();
    let mut entries = Vec::new();
    let mut routes = BTreeMap::new();
    for site in sites {
        let bytes = official_file(site);
        let recipe = recipes::parse_catalog_recipe(&bytes).unwrap();
        let mut tags = recipe.tags.clone();
        tags.sort();
        tags.push(TAG_OFFICIAL.to_owned());
        entries.push(Entry {
            id: recipe.id.clone(),
            name: recipe.name.clone(),
            version: recipe.version.clone(),
            author: "OpenMedia".into(),
            summary: format!("Quieter {}", recipe.name),
            hosts: vec![],
            sha256: sha256_hex(&bytes),
            size: bytes.len() as u64,
            published_at: 1,
            featured: false,
            tags,
            homepage: recipe.homepage().map(str::to_owned),
        });
        if !broken.contains(site) {
            routes.insert(
                format!("GET /v1/recipes/{}/{}.json", recipe.id, recipe.version),
                (200, bytes),
            );
        }
    }
    let index = Index {
        format: 1,
        key_id: KEY_ID.into(),
        sequence: 1,
        issued_at: now_secs() - 10,
        expires_at: now_secs() + 1000,
        recipes: entries,
        revoked: vec![],
    };
    let signed = sign(&index, &pkcs8).unwrap();
    routes.insert("GET /v1/index.json".into(), (200, signed.bytes));
    routes.insert(
        "GET /v1/index.json.sig".into(),
        (200, signed.signature.into_bytes()),
    );
    (routes, format!("{KEY_ID}:{}", STANDARD.encode(public)))
}

struct Fixture {
    _dir: tempfile::TempDir,
    server: Server,
    catalog: Catalog,
    recipes: Recipes,
    library: Library,
}

fn fixture(routes: BTreeMap<String, (u16, Vec<u8>)>, keys: &str) -> Fixture {
    let dir = tempfile::tempdir().unwrap();
    let server = Server::start(routes);
    let market = Market::new(&server.url(), keys).unwrap();
    let catalog = Catalog::new(
        Some(market),
        State::load(dir.path().join("catalog-state.json")),
    );
    let recipes = Recipes::load(dir.path().join("recipes")).unwrap();
    let library = Library::load(dir.path().join("library.json")).unwrap();
    Fixture {
        _dir: dir,
        server,
        catalog,
        recipes,
        library,
    }
}

fn run<F: std::future::Future>(future: F) -> F::Output {
    tauri::async_runtime::block_on(future)
}

fn ids(sites: &[&str]) -> Vec<String> {
    sites
        .iter()
        .map(|site| format!("market.official.{site}"))
        .collect()
}

/// A server that must never be called: any connection is a failure.
fn silent_server() -> Server {
    Server::start(BTreeMap::new())
}

fn unused_keys() -> String {
    let (_, public) = index::generate_key().unwrap();
    format!("{KEY_ID}:{}", STANDARD.encode(public))
}

#[test]
fn pro_gated_actions_stop_at_the_gate_before_any_request_or_id_read() {
    let silent = silent_server();
    let dir = tempfile::tempdir().unwrap();
    let market = Market::new(&silent.url(), &unused_keys()).unwrap();
    let catalog = Catalog::new(Some(market), State::load(dir.path().join("s.json")));
    let recipes = Recipes::load(dir.path().join("recipes")).unwrap();
    let free = FakeAccount::new(false, Some(PRO_USER));

    let comment = run(catalog.post_comment(&free, "market.calm", "hello"));
    assert!(matches!(comment, Err(Error::ProRequired)));
    let submit = run(catalog.submit(&free, &recipes, "custom.x", "calm", "Quiet", "Ada"));
    assert!(matches!(submit, Err(Error::ProRequired)));
    let library = Library::load(dir.path().join("library.json")).unwrap();
    let apply =
        run(catalog.onboarding_apply(&free, &recipes, &library, &ids(&["a", "b", "c", "d", "e"])));
    assert!(matches!(apply, Err(Error::ProRequired)));

    assert_eq!(free.id_reads.load(Ordering::SeqCst), 0);
    assert!(silent.hits().is_empty(), "a request was made");
}

#[test]
fn a_pro_user_without_a_store_identity_cannot_post_and_nothing_is_sent() {
    let silent = silent_server();
    let dir = tempfile::tempdir().unwrap();
    let market = Market::new(&silent.url(), &unused_keys()).unwrap();
    let catalog = Catalog::new(Some(market), State::load(dir.path().join("s.json")));
    let no_store = FakeAccount::new(true, None);
    let result = run(catalog.post_comment(&no_store, "market.calm", "hello"));
    assert!(matches!(result, Err(Error::Catalog(_))));
    let result = run(catalog.delete_comment(&no_store, COMMENT_ID));
    assert!(matches!(result, Err(Error::Catalog(_))));
    assert!(silent.hits().is_empty());
}

#[test]
fn a_comment_that_is_empty_or_too_long_is_refused_before_any_request() {
    let silent = silent_server();
    let dir = tempfile::tempdir().unwrap();
    let market = Market::new(&silent.url(), &unused_keys()).unwrap();
    let catalog = Catalog::new(Some(market), State::load(dir.path().join("s.json")));
    let pro = FakeAccount::new(true, Some(PRO_USER));
    for text in ["", "   ", &"x".repeat(281), "a\u{202E}b"] {
        assert!(run(catalog.post_comment(&pro, "market.calm", text)).is_err());
    }
    assert!(silent.hits().is_empty());
}

#[test]
fn a_pro_comment_is_sent_with_the_pro_header_and_trimmed_text_only() {
    let routes = BTreeMap::from([(
        "POST /v1/recipes/market.calm/comments".to_owned(),
        (
            201,
            br#"{"id":"123e4567-e89b-12d3-a456-426614174000"}"#.to_vec(),
        ),
    )]);
    let f = fixture(routes, &unused_keys());
    let pro = FakeAccount::new(true, Some(PRO_USER));
    run(f
        .catalog
        .post_comment(&pro, "market.calm", "  Works great  "))
    .unwrap();
    let hits = f.server.hits();
    assert_eq!(hits.len(), 1);
    assert!(hits[0].contains("x-pro-user: $rcanonymousid:0123456789abcdef"));
    assert!(!hits[0].contains("x-device-token"));
    assert!(hits[0].ends_with(r#"{"text":"Works great"}"#));
}

#[test]
fn comments_hide_blocked_commenters_and_mark_the_devices_own() {
    let own = community::commenter_of(PRO_USER);
    let body = serde_json::json!({ "comments": [
        { "id": COMMENT_ID, "commenter": own, "text": "mine", "createdAt": 3 },
        { "id": COMMENT_ID, "commenter": "aaaaaaaaaa", "text": "theirs", "createdAt": 2 },
        { "id": COMMENT_ID, "commenter": "bbbbbbbbbb", "text": "blocked", "createdAt": 1 },
    ]});
    let routes = BTreeMap::from([(
        "GET /v1/recipes/market.calm/comments.json".to_owned(),
        (200, body.to_string().into_bytes()),
    )]);
    let f = fixture(routes, &unused_keys());
    f.catalog.block_commenter("bbbbbbbbbb").unwrap();
    let account = FakeAccount::new(false, Some(PRO_USER));
    let comments = run(f.catalog.comments(&account, "market.calm"))
        .unwrap()
        .comments;
    let shown: Vec<_> = comments
        .iter()
        .map(|comment| (comment.text.as_str(), comment.mine))
        .collect();
    assert_eq!(shown, [("mine", true), ("theirs", false)]);
    // Reading needs no Pro and sends no identity.
    let hits = f.server.hits();
    assert!(!hits[0].contains("x-pro-user") && !hits[0].contains("x-device-token"));

    f.catalog.unblock_commenter("bbbbbbbbbb").unwrap();
    assert_eq!(
        run(f.catalog.comments(&account, "market.calm"))
            .unwrap()
            .comments
            .len(),
        3
    );
}

#[test]
fn reporting_a_comment_sends_the_device_token_not_the_store_id() {
    let routes = BTreeMap::from([(
        format!("POST /v1/comments/{COMMENT_ID}/report"),
        (204, Vec::new()),
    )]);
    let f = fixture(routes, &unused_keys());
    run(f.catalog.report_comment(COMMENT_ID)).unwrap();
    let hit = &f.server.hits()[0];
    assert!(hit.contains("x-device-token: "));
    assert!(!hit.contains("x-pro-user"));
    assert!(run(f.catalog.report_comment("../x")).is_err());
}

#[test]
fn rating_needs_a_listed_recipe_sends_the_documented_headers_and_remembers_the_stars() {
    let (mut routes, keys) = catalog_routes(&["youtube"], &[]);
    routes.insert(
        "POST /v1/recipes/market.official.youtube/rating".into(),
        (200, b"{}".to_vec()),
    );
    routes.insert(
        "GET /v1/ratings.json".into(),
        (
            200,
            br#"{"ratings":{"market.official.youtube":{"average":4.3,"count":12}}}"#.to_vec(),
        ),
    );
    let f = fixture(routes, &keys);
    // Not in the catalog yet: nothing is sent.
    assert!(run(f.catalog.rate("market.official.youtube", 4)).is_err());
    assert!(f.server.hits().is_empty());

    let listing = run(f.catalog.refresh(&f.recipes)).unwrap();
    assert_eq!(listing.items[0].rating.as_ref().map(|r| r.count), Some(12));
    assert_eq!(listing.items[0].my_rating, None);
    assert!(run(f.catalog.rate("market.official.youtube", 6)).is_err());

    run(f.catalog.rate("market.official.youtube", 4)).unwrap();
    let hit = f
        .server
        .hits()
        .into_iter()
        .find(|hit| hit.starts_with("post /v1/recipes/market.official.youtube/rating"))
        .unwrap();
    assert!(hit.contains("x-client: app"));
    assert!(hit.contains("x-device-token: "));
    assert!(!hit.contains("x-pro-user"));
    assert!(hit.ends_with(r#"{"stars":4}"#));

    let listing = run(f.catalog.refresh(&f.recipes)).unwrap();
    assert_eq!(listing.items[0].my_rating, Some(4));
}

#[test]
fn a_failed_ratings_fetch_is_not_an_error_and_the_rating_is_none() {
    let (routes, keys) = catalog_routes(&["youtube"], &[]);
    let f = fixture(routes, &keys);
    let listing = run(f.catalog.refresh(&f.recipes)).unwrap();
    assert_eq!(listing.items.len(), 1);
    assert_eq!(listing.items[0].rating, None);
    assert_eq!(
        listing.items[0]
            .tags
            .iter()
            .filter(|tag| *tag == "official")
            .count(),
        1
    );
}

#[test]
fn onboarding_offers_official_recipes_of_this_platform_only() {
    let (routes, keys) = catalog_routes(&["youtube", "discord"], &[]);
    let f = fixture(routes, &keys);
    let options = run(f.catalog.onboarding_options(&f.recipes)).unwrap();
    let platform = recipes::current_platform_tag();
    for option in &options {
        assert!(option.tags.iter().any(|tag| tag == platform));
        assert!(option.tags.iter().any(|tag| tag == "official"));
        assert!(option.homepage.starts_with("https://"));
    }
    assert!(
        options
            .iter()
            .any(|option| option.recipe_id == "market.official.youtube")
    );
    // Discord has only mobile fixtures, so only mobile builds are offered it.
    assert_eq!(
        options
            .iter()
            .any(|option| option.recipe_id == "market.official.discord"),
        platform == "mobile"
    );
}

#[test]
fn onboarding_rejects_too_many_duplicate_or_unlisted_picks_without_a_request() {
    let silent = silent_server();
    let dir = tempfile::tempdir().unwrap();
    let market = Market::new(&silent.url(), &unused_keys()).unwrap();
    let catalog = Catalog::new(Some(market), State::load(dir.path().join("s.json")));
    let recipes = Recipes::load(dir.path().join("recipes")).unwrap();
    let library = Library::load(dir.path().join("library.json")).unwrap();
    let pro = FakeAccount::new(true, Some(PRO_USER));
    let free = FakeAccount::new(false, None);

    let seven = ids(&["a", "b", "c", "d", "e", "f", "g"]);
    assert!(matches!(
        run(catalog.onboarding_apply(&pro, &recipes, &library, &seven)),
        Err(Error::Catalog(_))
    ));
    // Five picks need Pro; four do not, but a repeat is still refused.
    assert!(matches!(
        run(catalog.onboarding_apply(&free, &recipes, &library, &ids(&["a", "b", "c", "d", "e"]))),
        Err(Error::ProRequired)
    ));
    assert!(matches!(
        run(catalog.onboarding_apply(&free, &recipes, &library, &ids(&["a", "a"]))),
        Err(Error::Catalog(_))
    ));
    assert!(silent.hits().is_empty());
}

#[test]
fn onboarding_installs_picks_and_favorites_only_what_installed() {
    let (routes, keys) = catalog_routes(&["youtube", "reddit", "instagram"], &["reddit"]);
    let f = fixture(routes, &keys);
    let before = f.library.favorites().unwrap();
    let free = FakeAccount::new(false, None);

    let picks = ids(&["youtube", "reddit", "market-missing"]);
    let result = run(f
        .catalog
        .onboarding_apply(&free, &f.recipes, &f.library, &picks))
    .unwrap();
    assert_eq!(result.installed, ["market.official.youtube"]);
    assert_eq!(
        result.failed,
        ["market.official.reddit", "market.official.market-missing"]
    );
    assert!(f.recipes.get("market.official.youtube").is_some());
    assert!(f.recipes.get("market.official.reddit").is_none());

    let favorites = f.library.favorites().unwrap();
    assert_eq!(
        favorites.len(),
        1,
        "defaults were replaced by the one installed pick"
    );
    assert_eq!(favorites[0].name, "YouTube");
    assert_eq!(favorites[0].url, "https://www.youtube.com/");
    assert_ne!(favorites.len(), before.len());
}

#[test]
fn when_every_install_fails_the_favorites_are_untouched() {
    let (routes, keys) = catalog_routes(&["youtube", "reddit"], &["youtube", "reddit"]);
    let f = fixture(routes, &keys);
    let before: Vec<_> = f
        .library
        .favorites()
        .unwrap()
        .into_iter()
        .map(|favorite| favorite.url)
        .collect();
    let free = FakeAccount::new(false, None);
    let result = run(f.catalog.onboarding_apply(
        &free,
        &f.recipes,
        &f.library,
        &ids(&["youtube", "reddit"]),
    ))
    .unwrap();
    assert!(result.installed.is_empty());
    assert_eq!(result.failed.len(), 2);
    let after: Vec<_> = f
        .library
        .favorites()
        .unwrap()
        .into_iter()
        .map(|favorite| favorite.url)
        .collect();
    assert_eq!(before, after);
}

#[test]
fn a_pro_user_may_pick_six_and_a_free_user_four() {
    let sites = [
        "youtube",
        "reddit",
        "instagram",
        "facebook",
        "twitter",
        "tiktok",
    ];
    let (routes, keys) = catalog_routes(&sites, &[]);
    let f = fixture(routes, &keys);
    let free = FakeAccount::new(false, None);
    let pro = FakeAccount::new(true, Some(PRO_USER));
    assert!(matches!(
        run(f
            .catalog
            .onboarding_apply(&free, &f.recipes, &f.library, &ids(&sites[..5]))),
        Err(Error::ProRequired)
    ));
    let result = run(f
        .catalog
        .onboarding_apply(&pro, &f.recipes, &f.library, &ids(&sites)))
    .unwrap();
    // Every one of these has a mobile and a desktop fixture, so each is offered on any platform.
    assert_eq!(result.installed.len(), 6);
    assert_eq!(f.library.favorites().unwrap().len(), 6);
}

#[test]
fn only_a_non_official_entry_cannot_be_picked_in_onboarding() {
    let (routes, keys) = catalog_routes(&["youtube"], &[]);
    let f = fixture(routes, &keys);
    let free = FakeAccount::new(false, None);
    let result =
        run(f
            .catalog
            .onboarding_apply(&free, &f.recipes, &f.library, &["market.calm".to_owned()]))
        .unwrap();
    assert_eq!(result.failed, ["market.calm"]);
    assert!(result.installed.is_empty());
}
