mod compile;
mod matcher;
mod schema;
mod selector;

pub use compile::{OptionChoices, page_script};
pub use schema::{OptionGroup, Recipe};

use url::Url;

use crate::error::Result;

const BUNDLED: [&str; 5] = [
    include_str!("../../../recipes/bundled/instagram.json"),
    include_str!("../../../recipes/bundled/facebook.json"),
    include_str!("../../../recipes/bundled/twitter.json"),
    include_str!("../../../recipes/bundled/reddit.json"),
    include_str!("../../../recipes/bundled/youtube.json"),
];

pub fn bundled() -> Result<Vec<Recipe>> {
    BUNDLED.iter().map(|json| Recipe::parse(json)).collect()
}

/// The recipes the app ships with. The page script is compiled from them on demand, because it
/// depends on the user's toggles.
pub struct Recipes(Vec<Recipe>);

impl Recipes {
    pub fn bundled() -> Result<Self> {
        Ok(Self(bundled()?))
    }

    pub fn all(&self) -> &[Recipe] {
        &self.0
    }

    pub fn get(&self, id: &str) -> Option<&Recipe> {
        self.0.iter().find(|recipe| recipe.id == id)
    }

    /// The recipe whose `match` patterns cover this page.
    pub fn for_url(&self, url: &Url) -> Option<&Recipe> {
        self.0.iter().find(|recipe| {
            recipe
                .matches
                .iter()
                .filter_map(|pattern| matcher::Matcher::parse(pattern).ok())
                .any(|matcher| matcher.matches(url))
        })
    }

    /// The script injected into every site view: all recipes, matched by the page itself.
    pub fn script(&self, choices: &OptionChoices) -> Result<String> {
        page_script(&self.0, choices)
    }
}

#[cfg(test)]
mod tests {
    use std::{fs, path::Path};

    use scraper::{Html, Selector};

    use super::compile::recipe_css;
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

    fn fixture_pages(recipe: &Recipe) -> Vec<Html> {
        let fixtures_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../recipes/fixtures");
        let site = recipe.id.split('.').next().unwrap();
        let pages: Vec<Html> = fs::read_dir(fixtures_root.join(site))
            .unwrap_or_else(|_| panic!("recipe {} has no fixtures", recipe.id))
            .map(|entry| Html::parse_document(&fs::read_to_string(entry.unwrap().path()).unwrap()))
            .collect();
        assert!(!pages.is_empty(), "recipe {} has no fixtures", recipe.id);
        pages
    }

    #[test]
    fn no_hide_rule_touches_an_element_a_fixture_marks_data_keep_or_its_ancestors() {
        let keep = Selector::parse("[data-keep]").unwrap();
        for recipe in bundled().unwrap() {
            for page in fixture_pages(&recipe) {
                let mut hidden = std::collections::HashSet::new();
                for rule in &recipe.rules {
                    if let Rule::Hide { target, .. } = rule {
                        let selector = Selector::parse(&target.css).unwrap();
                        hidden.extend(
                            page.select(&selector)
                                .map(|element| (rule.id(), element.id())),
                        );
                    }
                }
                for element in page.select(&keep) {
                    for node in
                        std::iter::once(element.id()).chain(element.ancestors().map(|n| n.id()))
                    {
                        let culprit = hidden.iter().find(|(_, id)| *id == node);
                        assert!(
                            culprit.is_none(),
                            "{}: rule {:?} hides a protected element or its ancestor",
                            recipe.id,
                            culprit.map(|(rule, _)| rule)
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn every_bundled_rule_matches_something_in_its_dom_fixtures() {
        for recipe in bundled().unwrap() {
            let pages = fixture_pages(&recipe);
            for rule in &recipe.rules {
                let (Rule::Hide { target, .. } | Rule::Css { target, .. }) = rule;
                let selector = Selector::parse(&target.css).unwrap();
                let matched = pages
                    .iter()
                    .any(|page| page.select(&selector).next().is_some());
                assert!(
                    matched,
                    "{}: rule {} matches nothing in its fixtures",
                    recipe.id,
                    rule.id()
                );
            }
        }
    }

    const TOGGLED: &str = r#"{"schema":1,"id":"t.default","name":"T","version":"1.0.0","origin":"bundled","match":["https://t.example/*"],
      "options":[
        {"id":"nag","label":"Nag","description":"d","group":"annoyance","default":true},
        {"id":"feed","label":"Feed","description":"d","group":"content","default":false}],
      "rules":[
        {"id":"r1","label":"l","type":"hide","option":"nag","target":{"css":".nag"}},
        {"id":"r2","label":"l","type":"hide","option":"feed","target":{"css":".feed"}},
        {"id":"r3","label":"l","type":"css","option":"nag","target":{"css":"body"},"declarations":{"overflow-y":"auto"}},
        {"id":"r4","label":"l","type":"hide","target":{"css":".always"}}]}"#;

    fn css_for(choices: &[(&str, bool)]) -> String {
        let recipe = Recipe::parse(TOGGLED).unwrap();
        let saved = choices
            .iter()
            .map(|(option, on)| ((*option).to_owned(), *on))
            .collect();
        recipe_css(
            &recipe,
            &OptionChoices::from([("t.default".to_owned(), saved)]),
        )
    }

    #[test]
    fn options_start_at_their_defaults_and_rules_without_one_always_apply() {
        let css = css_for(&[]);
        assert!(css.contains(".nag{display:none!important}"));
        assert!(css.contains("body{overflow-y:auto!important;}"));
        assert!(css.contains(".always{display:none!important}"));
        assert!(!css.contains(".feed"));
    }

    #[test]
    fn a_saved_choice_overrides_the_default_in_both_directions() {
        let css = css_for(&[("nag", false), ("feed", true)]);
        assert!(!css.contains(".nag"));
        assert!(!css.contains("overflow-y"));
        assert!(css.contains(".feed{display:none!important}"));
        assert!(css.contains(".always{display:none!important}"));
    }

    #[test]
    fn choices_for_other_recipes_or_unknown_options_change_nothing() {
        let recipe = Recipe::parse(TOGGLED).unwrap();
        let other = OptionChoices::from([(
            "other.default".to_owned(),
            [("nag".to_owned(), false)].into(),
        )]);
        let unknown =
            OptionChoices::from([("t.default".to_owned(), [("gone".to_owned(), true)].into())]);
        assert_eq!(recipe_css(&recipe, &other), css_for(&[]));
        assert_eq!(recipe_css(&recipe, &unknown), css_for(&[]));
    }

    #[test]
    fn the_page_script_only_carries_enabled_rules() {
        let recipes = Recipes(vec![Recipe::parse(TOGGLED).unwrap()]);
        let script = recipes.script(&OptionChoices::new()).unwrap();
        assert!(script.contains(".nag{display:none!important}"));
        assert!(!script.contains(".feed"));
    }

    #[test]
    fn a_page_belongs_to_the_recipe_that_matches_its_url() {
        let recipes = Recipes::bundled().unwrap();
        let page = |url: &str| {
            recipes
                .for_url(&Url::parse(url).unwrap())
                .map(|r| r.id.clone())
        };
        assert_eq!(
            page("https://www.reddit.com/r/rust/").as_deref(),
            Some("reddit.default")
        );
        assert_eq!(page("https://example.com/"), None);
    }

    #[test]
    fn annoyances_start_on_and_content_starts_off() {
        for recipe in bundled().unwrap() {
            assert!(!recipe.options.is_empty(), "{} has no options", recipe.id);
            for option in &recipe.options {
                assert_eq!(
                    option.enabled_by_default,
                    option.group == OptionGroup::Annoyance,
                    "{}:{}",
                    recipe.id,
                    option.id
                );
            }
        }
    }

    #[test]
    fn options_must_be_used_and_rules_may_only_name_options_that_exist() {
        let with = |rules: &str, options: &str| {
            format!(
                r#"{{"schema":1,"id":"x.y","name":"n","version":"1.0.0","origin":"user","match":["https://a.com/*"],"options":[{options}],"rules":[{rules}]}}"#
            )
        };
        let option = |id: &str| {
            format!(
                r#"{{"id":"{id}","label":"l","description":"d","group":"content","default":false}}"#
            )
        };
        let rule = |option: &str| {
            format!(
                r#"{{"id":"r","label":"l","type":"hide","option":"{option}","target":{{"css":"a"}}}}"#
            )
        };
        assert!(Recipe::parse(&with(&rule("o"), &option("o"))).is_ok());
        assert!(Recipe::parse(&with(&rule("missing"), &option("o"))).is_err());
        assert!(
            Recipe::parse(&with(
                &rule("o"),
                &format!("{},{}", option("o"), option("p"))
            ))
            .is_err()
        );
        assert!(
            Recipe::parse(&with(
                &rule("o"),
                &format!("{},{}", option("o"), option("o"))
            ))
            .is_err()
        );
        assert!(Recipe::parse(&with(&rule("O"), &option("O"))).is_err());
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
