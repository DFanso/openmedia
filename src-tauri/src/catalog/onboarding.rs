//! First-run quick access: the official recipes for this platform, and installing the user's
//! picks through the same verified path as `marketplace_install`.

use serde::Serialize;

use super::index::Entry;
use super::{Account, Catalog};
use crate::error::{Error, Result};
use crate::library::{
    FREE_FAVORITE_LIMIT, FavoriteInput, Library, MAX_FAVORITE_NAME_CHARS, PRO_FAVORITE_LIMIT,
};
use crate::recipes::{Recipes, current_platform_tag};

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OnboardingOption {
    pub recipe_id: String,
    pub name: String,
    pub summary: String,
    pub homepage: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct OnboardingResult {
    pub installed: Vec<String>,
    pub failed: Vec<String>,
}

/// Official entries for this platform that can become a favorite (they have a homepage).
fn options_for(entries: &[Entry], platform: &str) -> Vec<OnboardingOption> {
    let mut options: Vec<OnboardingOption> = entries
        .iter()
        .filter(|entry| entry.is_official() && entry.has_tag(platform))
        .filter_map(|entry| {
            Some(OnboardingOption {
                recipe_id: entry.id.clone(),
                name: entry.name.clone(),
                summary: entry.summary.clone(),
                homepage: entry.homepage.clone()?,
                tags: entry.tags.clone(),
            })
        })
        .collect();
    options.sort_by(|a, b| {
        a.name
            .cmp(&b.name)
            .then_with(|| a.recipe_id.cmp(&b.recipe_id))
    });
    options
}

/// How many picks this person may apply: four, or six with Pro.
fn pick_limit(account: &impl Account) -> usize {
    if account.require_pro().is_ok() {
        PRO_FAVORITE_LIMIT
    } else {
        FREE_FAVORITE_LIMIT
    }
}

fn favorite_for(option: &OnboardingOption) -> FavoriteInput {
    FavoriteInput {
        name: option.name.chars().take(MAX_FAVORITE_NAME_CHARS).collect(),
        url: option.homepage.clone(),
        notify: true,
    }
}

impl Catalog {
    /// The official recipes for the current platform, from the verified signed index.
    pub async fn onboarding_options(&self, recipes: &Recipes) -> Result<Vec<OnboardingOption>> {
        let (index, _) = self.fetch(recipes).await?;
        Ok(options_for(&index.recipes, current_platform_tag()))
    }

    /// Installs the picks and puts each installed recipe's homepage in quick access. The list of
    /// picks is checked first (no repeats, no more than 4, or 6 with Pro); a pick that is not an
    /// official option, or that fails to download, verify or save, is reported in `failed` and
    /// gets no favorite. Quick access becomes exactly the installed picks, and is left alone when
    /// none installed.
    pub async fn onboarding_apply(
        &self,
        account: &impl Account,
        recipes: &Recipes,
        library: &Library,
        ids: &[String],
    ) -> Result<OnboardingResult> {
        if ids.len() > PRO_FAVORITE_LIMIT {
            return Err(Error::Catalog("choose fewer sites".into()));
        }
        if ids.len() > pick_limit(account) {
            return Err(Error::ProRequired);
        }
        if ids
            .iter()
            .enumerate()
            .any(|(position, id)| ids[..position].contains(id))
        {
            return Err(Error::Catalog("a site was chosen twice".into()));
        }
        let (index, _) = self.fetch(recipes).await?;
        let options = options_for(&index.recipes, current_platform_tag());
        let mut installed = Vec::new();
        let mut failed = Vec::new();
        let mut favorites = Vec::new();
        for id in ids {
            let Some(option) = options.iter().find(|option| &option.recipe_id == id) else {
                failed.push(id.clone());
                continue;
            };
            match self.install(recipes, id).await {
                Ok(_) => {
                    installed.push(id.clone());
                    favorites.push(favorite_for(option));
                }
                Err(_) => failed.push(id.clone()),
            }
        }
        if !favorites.is_empty() {
            library.set_favorites(favorites)?;
        }
        Ok(OnboardingResult { installed, failed })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(id: &str, tags: &[&str], homepage: Option<&str>) -> Entry {
        Entry {
            id: id.into(),
            name: id.rsplit('.').next().unwrap().to_owned(),
            version: "1.0.0".into(),
            author: "OpenMedia".into(),
            summary: "s".into(),
            hosts: vec![],
            sha256: "0".repeat(64),
            size: 10,
            published_at: 0,
            featured: false,
            tags: tags.iter().map(|tag| (*tag).to_owned()).collect(),
            homepage: homepage.map(str::to_owned),
        }
    }

    #[test]
    fn only_official_entries_for_this_platform_with_a_homepage_are_offered() {
        let entries = [
            entry(
                "market.official.youtube",
                &["desktop", "mobile", "official"],
                Some("https://www.youtube.com/"),
            ),
            entry(
                "market.official.snapchat",
                &["mobile", "official"],
                Some("https://www.snapchat.com/"),
            ),
            entry(
                "market.official.reddit",
                &["desktop", "official"],
                Some("https://www.reddit.com/"),
            ),
            entry("market.official.nohome", &["mobile", "official"], None),
            entry(
                "market.calm",
                &["mobile", "community"],
                Some("https://www.example.com/"),
            ),
        ];
        let ids = |platform: &str| -> Vec<String> {
            options_for(&entries, platform)
                .into_iter()
                .map(|option| option.recipe_id)
                .collect()
        };
        assert_eq!(
            ids("mobile"),
            ["market.official.snapchat", "market.official.youtube"]
        );
        assert_eq!(
            ids("desktop"),
            ["market.official.reddit", "market.official.youtube"]
        );
    }

    #[test]
    fn a_favorite_is_the_recipe_name_cut_to_the_favorite_limit_and_its_homepage() {
        let option = OnboardingOption {
            recipe_id: "market.official.x".into(),
            name: "A very long recipe name indeed".into(),
            summary: String::new(),
            homepage: "https://x.example/".into(),
            tags: vec![],
        };
        let favorite = favorite_for(&option);
        assert_eq!(favorite.name.chars().count(), MAX_FAVORITE_NAME_CHARS);
        assert_eq!(favorite.url, "https://x.example/");
    }
}
