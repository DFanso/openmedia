mod compile;
mod matcher;
mod schema;
mod selector;

pub use compile::page_script;
pub use schema::Recipe;

use crate::error::Result;

const BUNDLED: [&str; 1] = [include_str!("../../../recipes/bundled/reddit.json")];

pub fn bundled() -> Result<Vec<Recipe>> {
    BUNDLED.iter().map(|json| Recipe::parse(json)).collect()
}

/// The script injected into every site view: all enabled recipes, matched by the page itself.
pub struct RecipeScript(String);

impl RecipeScript {
    pub fn bundled() -> Result<Self> {
        Ok(Self(page_script(&bundled()?)?))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[cfg(test)]
mod tests {
    use std::{fs, path::Path};

    use scraper::{Html, Selector};

    use super::schema::Rule;
    use super::*;

    #[test]
    fn every_bundled_recipe_parses_and_validates() {
        let recipes = bundled().unwrap();
        assert!(!recipes.is_empty());
        let mut ids: Vec<_> = recipes.iter().map(|r| r.id.as_str()).collect();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), recipes.len());
    }

    #[test]
    fn every_bundled_rule_matches_something_in_its_dom_fixtures() {
        let fixtures_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../recipes/fixtures");
        for recipe in bundled().unwrap() {
            let site = recipe.id.split('.').next().unwrap();
            let pages: Vec<Html> = fs::read_dir(fixtures_root.join(site))
                .unwrap_or_else(|_| panic!("recipe {} has no fixtures", recipe.id))
                .map(|entry| {
                    Html::parse_document(&fs::read_to_string(entry.unwrap().path()).unwrap())
                })
                .collect();
            assert!(!pages.is_empty(), "recipe {} has no fixtures", recipe.id);
            for rule in &recipe.rules {
                let (Rule::Hide { target, .. } | Rule::Css { target, .. }) = rule;
                let selector = Selector::parse(&target.css).unwrap();
                let matched = pages
                    .iter()
                    .any(|page| page.select(&selector).next().is_some());
                assert!(
                    matched,
                    "rule {} matches nothing in its fixtures",
                    rule.id()
                );
            }
        }
    }

    #[test]
    fn the_page_script_carries_the_reddit_rules_and_a_reddit_matcher() {
        let script = RecipeScript::bundled().unwrap();
        let text = script.as_str();
        assert!(text.contains("#open-app-header-cta{display:none!important}"));
        assert!(text.contains("overflow-y:auto!important"));
        assert!(text.contains("reddit"));
    }

    #[test]
    fn unsupported_or_unsafe_recipes_are_refused() {
        let base = |extra: &str| {
            format!(
                r#"{{"schema":1,"id":"x.y","name":"n","version":"1.0.0","origin":"user","match":["https://a.com/*"],"rules":[{extra}]}}"#
            )
        };
        let hide = |css: &str| {
            format!(r#"{{"id":"r","label":"l","type":"hide","target":{{"css":"{css}"}}}}"#)
        };
        assert!(Recipe::parse(&base(&hide("a"))).is_ok());
        assert!(Recipe::parse(&base(&hide("a{x}"))).is_err());
        assert!(
            Recipe::parse(&base(
                r#"{"id":"r","label":"l","type":"hide","target":{"ariaLabel":"Reels"}}"#
            ))
            .is_err()
        );
        assert!(
            Recipe::parse(&base(
                r#"{"id":"r","label":"l","type":"script","code":"1"}"#
            ))
            .is_err()
        );
        let twice = format!("{},{}", hide("a"), hide("b"));
        assert!(Recipe::parse(&base(&twice)).is_err());
        assert!(Recipe::parse(&base(&hide("a")).replace("\"schema\":1", "\"schema\":2")).is_err());
        assert!(
            Recipe::parse(&base(&hide("a")).replace("https://a.com/*", "https://*/*")).is_err()
        );
    }
}
