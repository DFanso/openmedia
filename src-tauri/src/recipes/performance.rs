//! What a recipe knows about making its own site open faster. Each entry is something measured on
//! the site, kept as data so no site's name is ever in the code (`docs/wiki/recipe-format.md`).

use serde::{Deserialize, Serialize};
use tauri_plugin_siteview::site::site_of_host;
use url::Url;

use super::schema::PLATFORM_TAGS;
use crate::error::{Error, Result};

const MAX_ENTRIES: usize = 4;
const MAX_URL_CHARS: usize = 200;

/// A page the site always sends somewhere else before showing it: `https://www.youtube.com/`
/// answers a phone with a redirect to `https://m.youtube.com/`, which costs a round trip and a
/// second secure connection every time the page opens. The app opens `to` directly when asked for
/// exactly `from`.
///
/// A site answers a phone and a computer differently, so `platform` (`mobile` or `desktop`, one of
/// the recipe's platform tags) says where the redirect happens; without it the entry applies
/// everywhere.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EntryRedirect {
    pub from: String,
    pub to: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub platform: Option<String>,
}

/// How the ad blocker treats this site. The lists' element-hiding rules (the ones that hide ad
/// slots and banners by selector) are the part of them a page pays for on every load, and a site
/// whose ads are part of its own feed gets nothing from them: Instagram's first contentful paint
/// came about 200 ms sooner on the iPhone 17 Pro Max simulator without them (735 to 841 ms with,
/// 557 to 615 ms without, three runs each), while YouTube and Reddit did not change measurably. Blocking of requests is not affected.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct AdBlockTuning {
    /// `false` leaves the element-hiding rules of the ad blocker's lists off for this site.
    pub element_hiding: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Performance {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ad_block: Option<AdBlockTuning>,
    /// Pages to open at their final address. Applies to an exact address only, so a page the
    /// reader typed or followed (a video, a profile) is never rewritten.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub entry: Vec<EntryRedirect>,
}

/// An https address with no credentials, query or fragment: a page the site itself owns, not one
/// that carries state.
fn plain_page(text: &str) -> Option<Url> {
    if text.len() > MAX_URL_CHARS
        || text.contains('\\')
        || text.chars().any(|c| c.is_control() || c.is_whitespace())
    {
        return None;
    }
    let url = Url::parse(text).ok()?;
    (url.scheme() == "https"
        && url.host_str().is_some()
        && url.username().is_empty()
        && url.password().is_none()
        && url.query().is_none()
        && url.fragment().is_none())
    .then_some(url)
}

impl Performance {
    /// `covers` says whether one of the recipe's own `match` patterns holds the page. Both ends of
    /// an entry must be covered and on one site, so a recipe can never send the reader to a site
    /// its review screen did not show.
    pub(super) fn validate(&self, recipe_id: &str, covers: impl Fn(&Url) -> bool) -> Result<()> {
        let invalid = |reason: &str| Error::Recipe(format!("performance {recipe_id}: {reason}"));
        if self.entry.len() > MAX_ENTRIES {
            return Err(invalid("too many entry addresses"));
        }
        let mut pairs = Vec::with_capacity(self.entry.len());
        for entry in &self.entry {
            let (Some(from), Some(to)) = (plain_page(&entry.from), plain_page(&entry.to)) else {
                return Err(invalid(
                    "an entry address is an https page without credentials, query or fragment",
                ));
            };
            if entry
                .platform
                .as_deref()
                .is_some_and(|tag| !PLATFORM_TAGS.contains(&tag))
            {
                return Err(invalid("an entry platform is mobile or desktop"));
            }
            if from == to {
                return Err(invalid("an entry address that leads to itself"));
            }
            if !covers(&from) || !covers(&to) {
                return Err(invalid(
                    "an entry address is not covered by the recipe's patterns",
                ));
            }
            if site_of_host(from.host_str().unwrap_or_default())
                != site_of_host(to.host_str().unwrap_or_default())
            {
                return Err(invalid("an entry address leaves its site"));
            }
            pairs.push((from, to));
        }
        let leads_to_a_redirect = |to: &Url| pairs.iter().any(|(from, _)| from == to);
        if pairs.iter().any(|(from, to)| {
            leads_to_a_redirect(to) || pairs.iter().filter(|(other, _)| other == from).count() > 1
        }) {
            return Err(invalid("entry addresses chain or repeat"));
        }
        Ok(())
    }

    /// Whether the ad blocker's element-hiding rules are left off on this site.
    pub fn skips_element_hiding(&self) -> bool {
        self.ad_block
            .as_ref()
            .is_some_and(|tuning| !tuning.element_hiding)
    }

    /// Where to open `url` instead on `platform`, when this recipe knows a faster way to the same
    /// page.
    pub fn entry_for(&self, url: &Url, platform: &str) -> Option<Url> {
        self.entry
            .iter()
            .filter(|entry| entry.platform.as_deref().is_none_or(|tag| tag == platform))
            .find(|entry| Url::parse(&entry.from).is_ok_and(|from| &from == url))
            .and_then(|entry| Url::parse(&entry.to).ok())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(from: &str, to: &str) -> EntryRedirect {
        EntryRedirect {
            from: from.into(),
            to: to.into(),
            platform: None,
        }
    }

    fn performance(entries: Vec<EntryRedirect>) -> Performance {
        Performance {
            ad_block: None,
            entry: entries,
        }
    }

    fn covers_youtube(url: &Url) -> bool {
        url.host_str()
            .is_some_and(|host| host.ends_with("youtube.com"))
    }

    #[test]
    fn an_exact_address_opens_at_its_final_page_and_nothing_else_does() {
        let p = performance(vec![entry(
            "https://www.youtube.com/",
            "https://m.youtube.com/",
        )]);
        let home = Url::parse("https://www.youtube.com/").unwrap();
        let video = Url::parse("https://www.youtube.com/watch?v=abc").unwrap();
        let with_query = Url::parse("https://www.youtube.com/?app=desktop").unwrap();
        assert_eq!(
            p.entry_for(&home, "mobile"),
            Some(Url::parse("https://m.youtube.com/").unwrap())
        );
        assert_eq!(p.entry_for(&video, "mobile"), None);
        assert_eq!(p.entry_for(&with_query, "mobile"), None);
    }

    #[test]
    fn only_an_explicit_false_turns_element_hiding_off() {
        let on = Performance {
            ad_block: Some(AdBlockTuning {
                element_hiding: true,
            }),
            entry: Vec::new(),
        };
        let off = Performance {
            ad_block: Some(AdBlockTuning {
                element_hiding: false,
            }),
            entry: Vec::new(),
        };
        assert!(!Performance::default().skips_element_hiding());
        assert!(!on.skips_element_hiding());
        assert!(off.skips_element_hiding());
    }

    #[test]
    fn a_redirect_that_only_a_phone_gets_is_left_alone_on_a_computer() {
        let mut mobile_only = entry("https://www.youtube.com/", "https://m.youtube.com/");
        mobile_only.platform = Some("mobile".into());
        let p = performance(vec![mobile_only]);
        let home = Url::parse("https://www.youtube.com/").unwrap();
        assert!(p.entry_for(&home, "mobile").is_some());
        assert_eq!(p.entry_for(&home, "desktop"), None);
    }

    #[test]
    fn an_entry_that_stays_on_the_recipes_pages_and_site_is_accepted() {
        let p = performance(vec![entry(
            "https://www.youtube.com/",
            "https://m.youtube.com/",
        )]);
        p.validate("t", covers_youtube).unwrap();
    }

    #[test]
    fn an_entry_that_leaves_the_site_or_the_patterns_is_refused() {
        let elsewhere = performance(vec![entry(
            "https://www.youtube.com/",
            "https://youtube.evil.com/",
        )]);
        assert!(elsewhere.validate("t", |_| true).is_err());
        let uncovered = performance(vec![entry(
            "https://www.youtube.com/",
            "https://m.youtube.com/",
        )]);
        assert!(
            uncovered
                .validate("t", |url| url.host_str() == Some("www.youtube.com"))
                .is_err()
        );
    }

    #[test]
    fn an_entry_that_carries_state_or_loops_is_refused() {
        for bad in [
            entry("http://www.youtube.com/", "https://m.youtube.com/"),
            entry("https://www.youtube.com/", "https://m.youtube.com/?a=1"),
            entry("https://www.youtube.com/", "https://u:p@m.youtube.com/"),
            entry("https://www.youtube.com/", "https://www.youtube.com/"),
        ] {
            assert!(
                performance(vec![bad])
                    .validate("t", covers_youtube)
                    .is_err()
            );
        }
        let chained = performance(vec![
            entry("https://www.youtube.com/", "https://m.youtube.com/"),
            entry("https://m.youtube.com/", "https://music.youtube.com/"),
        ]);
        assert!(chained.validate("t", covers_youtube).is_err());
    }
}
