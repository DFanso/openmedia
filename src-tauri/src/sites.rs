use std::collections::BTreeMap;

use serde::Serialize;
use url::Url;

use crate::recipes::{OptionChoices, OptionGroup, Recipes};

/// One toggle as Settings shows it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OptionView {
    pub id: String,
    pub label: String,
    pub description: String,
    pub group: OptionGroup,
    pub enabled: bool,
    #[serde(rename = "default")]
    pub enabled_by_default: bool,
}

/// A site's section in Settings: its toggles with the user's choices applied, and its own bottom
/// margin if it has one.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteSettings {
    pub recipe_id: String,
    pub name: String,
    pub options: Vec<OptionView>,
    pub bottom_margin: Option<u32>,
}

pub fn site_settings(
    recipes: &Recipes,
    choices: &OptionChoices,
    margins: &BTreeMap<String, u32>,
) -> Vec<SiteSettings> {
    recipes
        .all()
        .iter()
        .map(|recipe| {
            let saved = choices.get(&recipe.id);
            let mut options: Vec<OptionView> = recipe
                .options
                .iter()
                .map(|option| OptionView {
                    id: option.id.clone(),
                    label: option.label.clone(),
                    description: option.description.clone(),
                    group: option.group,
                    enabled: saved
                        .and_then(|saved| saved.get(&option.id))
                        .copied()
                        .unwrap_or(option.enabled_by_default),
                    enabled_by_default: option.enabled_by_default,
                })
                .collect();
            options.sort_by_key(|option| option.group);
            SiteSettings {
                recipe_id: recipe.id.clone(),
                name: recipe.name.clone(),
                options,
                bottom_margin: margins.get(&recipe.id).copied(),
            }
        })
        .collect()
}

/// The margin to keep under this page: its site's own, else the shared one.
pub fn bottom_margin_for(
    recipes: &Recipes,
    margins: &BTreeMap<String, u32>,
    shared: u32,
    url: &Url,
) -> u32 {
    recipes
        .for_url(url)
        .and_then(|recipe| margins.get(&recipe.id).copied())
        .unwrap_or(shared)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn site<'a>(sites: &'a [SiteSettings], id: &str) -> &'a SiteSettings {
        sites.iter().find(|site| site.recipe_id == id).unwrap()
    }

    #[test]
    fn every_bundled_site_is_listed_with_annoyances_first_and_defaults_applied() {
        let recipes = Recipes::bundled().unwrap();
        let sites = site_settings(&recipes, &OptionChoices::new(), &BTreeMap::new());
        assert_eq!(sites.len(), recipes.all().len());
        for site in &sites {
            let groups: Vec<_> = site.options.iter().map(|option| option.group).collect();
            assert!(groups.is_sorted(), "{} is not grouped", site.name);
            assert!(
                site.options
                    .iter()
                    .all(|option| option.enabled == option.enabled_by_default)
            );
            assert_eq!(site.bottom_margin, None);
        }
    }

    #[test]
    fn saved_choices_show_up_in_the_listing_and_only_for_their_own_site() {
        let recipes = Recipes::bundled().unwrap();
        let choices = OptionChoices::from([(
            "youtube.default".to_owned(),
            [("shorts".to_owned(), true), ("open-app".to_owned(), false)].into(),
        )]);
        let sites = site_settings(&recipes, &choices, &BTreeMap::new());
        let youtube = site(&sites, "youtube.default");
        let state = |id: &str| youtube.options.iter().find(|o| o.id == id).unwrap().enabled;
        assert!(state("shorts"));
        assert!(!state("open-app"));
        assert!(
            site(&sites, "instagram.default")
                .options
                .iter()
                .all(|option| option.enabled == option.enabled_by_default)
        );
    }

    #[test]
    fn a_page_uses_its_sites_margin_else_the_shared_one() {
        let recipes = Recipes::bundled().unwrap();
        let margins = BTreeMap::from([("youtube.default".to_owned(), 40)]);
        let margin =
            |url: &str| bottom_margin_for(&recipes, &margins, 12, &Url::parse(url).unwrap());
        assert_eq!(margin("https://m.youtube.com/watch?v=x"), 40);
        assert_eq!(margin("https://www.instagram.com/"), 12);
        assert_eq!(margin("https://example.com/"), 12);
    }

    #[test]
    fn twitter_and_x_addresses_share_one_site() {
        let recipes = Recipes::bundled().unwrap();
        let id = |url: &str| {
            recipes
                .for_url(&Url::parse(url).unwrap())
                .map(|recipe| recipe.id.clone())
        };
        assert_eq!(id("https://x.com/home").as_deref(), Some("twitter.default"));
        assert_eq!(
            id("https://twitter.com/").as_deref(),
            Some("twitter.default")
        );
        assert_eq!(
            id("https://m.facebook.com/").as_deref(),
            Some("facebook.default")
        );
    }
}
