use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
};

use serde::{Deserialize, Serialize};
use tauri_plugin_siteview::validate::parse_web_url;
use uuid::Uuid;

use crate::ai::{AiSettings, MAX_PROVIDERS, ProviderConfig, ProviderInput};
use crate::error::{Error, Result};

const FORMAT_VERSION: u32 = 2;
pub const MAX_FAVORITES: usize = 6;
const MAX_FAVORITE_NAME_CHARS: usize = 20;
const MAX_ICON_CHARS: usize = 200_000;
const ICON_PREFIX: &str = "data:image/png;base64,";

const DEFAULT_FAVORITES: [(&str, &str); 4] = [
    ("Instagram", "https://www.instagram.com/"),
    ("Facebook", "https://www.facebook.com/"),
    ("Twitter", "https://twitter.com/"),
    ("Reddit", "https://www.reddit.com/"),
];

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Theme {
    #[default]
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Favorite {
    pub id: Uuid,
    pub name: String,
    pub url: String,
    /// A small PNG `data:` URL fetched from the site itself; filled in when the state is read.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FavoriteInput {
    pub name: String,
    pub url: String,
}

/// Everything the shell needs at startup.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppState {
    pub profile_id: Uuid,
    pub favorites: Vec<Favorite>,
    pub last_url: Option<String>,
    pub onboarded: bool,
    pub theme: Theme,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LibraryData {
    version: u32,
    profile_id: Uuid,
    favorites: Vec<Favorite>,
    last_url: Option<String>,
    #[serde(default)]
    onboarded: bool,
    #[serde(default)]
    theme: Theme,
    /// Site icons by host. They come from the sites themselves and hold nothing private.
    #[serde(default)]
    icons: BTreeMap<String, String>,
    /// Provider settings without keys; keys live in the OS secure store.
    #[serde(default)]
    ai: AiSettings,
}

/// The user's favorites, page, theme and provider settings, persisted as one JSON file. Holds no
/// secrets and no cookies: site sessions live in the native data store of `profile_id`, and API
/// keys in the OS secure store.
pub struct Library {
    path: PathBuf,
    data: Mutex<LibraryData>,
}

impl Library {
    pub fn load(path: PathBuf) -> Result<Self> {
        let data = match fs::read_to_string(&path) {
            Ok(text) => parse(&text)?,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => default_data(),
            Err(e) => return Err(e.into()),
        };
        let library = Self {
            path,
            data: Mutex::new(data),
        };
        {
            let data = library.lock()?;
            library.save(&data)?;
        }
        Ok(library)
    }

    pub fn state(&self) -> Result<AppState> {
        let data = self.lock()?;
        Ok(AppState {
            profile_id: data.profile_id,
            favorites: with_icons(&data),
            last_url: data.last_url.clone(),
            onboarded: data.onboarded,
            theme: data.theme,
        })
    }

    pub fn set_favorites(&self, inputs: Vec<FavoriteInput>) -> Result<Vec<Favorite>> {
        if inputs.len() > MAX_FAVORITES {
            return Err(Error::TooManyFavorites(MAX_FAVORITES));
        }
        let favorites = inputs
            .into_iter()
            .map(favorite_from_input)
            .collect::<Result<Vec<_>>>()?;
        let mut data = self.lock()?;
        data.favorites = favorites;
        self.save(&data)?;
        Ok(with_icons(&data))
    }

    pub fn set_last_url(&self, url: &str) -> Result<()> {
        let url = parse_web_url(url)?.to_string();
        let mut data = self.lock()?;
        data.last_url = Some(url);
        self.save(&data)
    }

    pub fn set_onboarded(&self, onboarded: bool) -> Result<()> {
        let mut data = self.lock()?;
        data.onboarded = onboarded;
        self.save(&data)
    }

    pub fn set_theme(&self, theme: Theme) -> Result<()> {
        let mut data = self.lock()?;
        data.theme = theme;
        self.save(&data)
    }

    /// Favorites whose site has no cached icon yet, as `(host, page url)`.
    pub fn favorites_missing_icons(&self) -> Result<Vec<(String, String)>> {
        let data = self.lock()?;
        let mut missing: Vec<(String, String)> = Vec::new();
        for favorite in &data.favorites {
            if let Some(host) = host_of(&favorite.url)
                && !data.icons.contains_key(&host)
                && !missing.iter().any(|(h, _)| *h == host)
            {
                missing.push((host, favorite.url.clone()));
            }
        }
        Ok(missing)
    }

    pub fn set_icon(&self, host: &str, data_url: &str) -> Result<()> {
        if !data_url.starts_with(ICON_PREFIX) || data_url.len() > MAX_ICON_CHARS {
            return Ok(());
        }
        let mut data = self.lock()?;
        data.icons.insert(host.to_owned(), data_url.to_owned());
        self.save(&data)
    }

    pub fn favorites(&self) -> Result<Vec<Favorite>> {
        let data = self.lock()?;
        Ok(with_icons(&data))
    }

    pub fn ai_settings(&self) -> Result<AiSettings> {
        Ok(self.lock()?.ai.clone())
    }

    pub fn provider(&self, id: Uuid) -> Result<ProviderConfig> {
        self.lock()?
            .ai
            .providers
            .iter()
            .find(|p| p.id == id)
            .cloned()
            .ok_or(Error::ProviderNotFound)
    }

    pub fn upsert_provider(&self, input: ProviderInput) -> Result<ProviderConfig> {
        let config = ProviderConfig::from_input(input)?;
        let mut data = self.lock()?;
        match data.ai.providers.iter().position(|p| p.id == config.id) {
            Some(index) => data.ai.providers[index] = config.clone(),
            None if data.ai.providers.len() >= MAX_PROVIDERS => {
                return Err(Error::TooManyProviders(MAX_PROVIDERS));
            }
            None => data.ai.providers.push(config.clone()),
        }
        if data.ai.active_id.is_none() {
            data.ai.active_id = Some(config.id);
        }
        self.save(&data)?;
        Ok(config)
    }

    pub fn delete_provider(&self, id: Uuid) -> Result<()> {
        let mut data = self.lock()?;
        let before = data.ai.providers.len();
        data.ai.providers.retain(|p| p.id != id);
        if data.ai.providers.len() == before {
            return Err(Error::ProviderNotFound);
        }
        if data.ai.active_id == Some(id) {
            data.ai.active_id = data.ai.providers.first().map(|p| p.id);
        }
        self.save(&data)
    }

    pub fn set_active_provider(&self, id: Option<Uuid>) -> Result<()> {
        let mut data = self.lock()?;
        if let Some(id) = id
            && !data.ai.providers.iter().any(|p| p.id == id)
        {
            return Err(Error::ProviderNotFound);
        }
        data.ai.active_id = id;
        self.save(&data)
    }

    fn lock(&self) -> Result<MutexGuard<'_, LibraryData>> {
        self.data.lock().map_err(|_| Error::Poisoned)
    }

    fn save(&self, data: &LibraryData) -> Result<()> {
        write_atomically(&self.path, &serde_json::to_vec_pretty(data)?)?;
        Ok(())
    }
}

fn host_of(url: &str) -> Option<String> {
    parse_web_url(url)
        .ok()
        .and_then(|u| u.host_str().map(str::to_owned))
}

fn with_icons(data: &LibraryData) -> Vec<Favorite> {
    data.favorites
        .iter()
        .map(|favorite| Favorite {
            icon: host_of(&favorite.url).and_then(|host| data.icons.get(&host).cloned()),
            ..favorite.clone()
        })
        .collect()
}

fn parse(text: &str) -> Result<LibraryData> {
    let data: LibraryData = serde_json::from_str(text)?;
    if data.version != FORMAT_VERSION {
        return Err(Error::UnsupportedVersion(data.version));
    }
    Ok(data)
}

fn default_data() -> LibraryData {
    LibraryData {
        version: FORMAT_VERSION,
        profile_id: Uuid::new_v4(),
        favorites: DEFAULT_FAVORITES
            .iter()
            .map(|(name, url)| Favorite {
                id: Uuid::new_v4(),
                name: (*name).to_owned(),
                url: (*url).to_owned(),
                icon: None,
            })
            .collect(),
        last_url: None,
        onboarded: false,
        theme: Theme::System,
        icons: BTreeMap::new(),
        ai: AiSettings::default(),
    }
}

fn favorite_from_input(input: FavoriteInput) -> Result<Favorite> {
    let name = input.name.trim();
    if name.is_empty() || name.chars().count() > MAX_FAVORITE_NAME_CHARS {
        return Err(Error::InvalidFavoriteName);
    }
    Ok(Favorite {
        id: Uuid::new_v4(),
        name: name.to_owned(),
        url: parse_web_url(&input.url)?.to_string(),
        icon: None,
    })
}

fn write_atomically(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, bytes)?;
    fs::rename(&temp, path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::ProviderKind;

    fn library() -> (tempfile::TempDir, Library) {
        let dir = tempfile::tempdir().unwrap();
        let library = Library::load(dir.path().join("library.json")).unwrap();
        (dir, library)
    }

    fn reload(dir: &tempfile::TempDir) -> Library {
        Library::load(dir.path().join("library.json")).unwrap()
    }

    fn input(name: &str, url: &str) -> FavoriteInput {
        FavoriteInput {
            name: name.into(),
            url: url.into(),
        }
    }

    fn provider(name: &str) -> ProviderInput {
        ProviderInput {
            id: None,
            name: name.into(),
            kind: ProviderKind::Anthropic,
            base_url: "https://api.anthropic.com".into(),
            model: None,
        }
    }

    #[test]
    fn first_run_has_the_four_default_favorites_in_order() {
        let (_dir, library) = library();
        let names: Vec<_> = library
            .state()
            .unwrap()
            .favorites
            .into_iter()
            .map(|f| f.name)
            .collect();
        assert_eq!(names, ["Instagram", "Facebook", "Twitter", "Reddit"]);
    }

    #[test]
    fn the_profile_id_is_stable_across_reloads() {
        let (dir, library) = library();
        let first = library.state().unwrap().profile_id;
        assert_eq!(reload(&dir).state().unwrap().profile_id, first);
    }

    #[test]
    fn edited_favorites_and_last_url_survive_a_reload() {
        let (dir, library) = library();
        library
            .set_favorites(vec![input(" YouTube ", "https://m.youtube.com")])
            .unwrap();
        library.set_last_url("https://m.youtube.com/feed").unwrap();
        let state = reload(&dir).state().unwrap();
        assert_eq!(state.favorites.len(), 1);
        assert_eq!(state.favorites[0].name, "YouTube");
        assert_eq!(
            state.last_url.as_deref(),
            Some("https://m.youtube.com/feed")
        );
    }

    #[test]
    fn favorites_may_be_emptied() {
        let (_dir, library) = library();
        assert!(library.set_favorites(vec![]).unwrap().is_empty());
    }

    #[test]
    fn favorite_urls_must_be_web_urls_and_nothing_is_saved_on_error() {
        let (_dir, library) = library();
        let before = library.state().unwrap().favorites;
        for url in ["javascript:alert(1)", "file:///etc/passwd", "nope"] {
            assert!(
                library.set_favorites(vec![input("x", url)]).is_err(),
                "{url}"
            );
        }
        assert_eq!(library.state().unwrap().favorites, before);
    }

    #[test]
    fn favorite_names_are_trimmed_and_bounded() {
        let (_dir, library) = library();
        let bad = ["   ", &"x".repeat(21)];
        for name in bad {
            assert!(matches!(
                library.set_favorites(vec![input(name, "https://a.com")]),
                Err(Error::InvalidFavoriteName)
            ));
        }
    }

    #[test]
    fn the_favorite_count_is_capped() {
        let (_dir, library) = library();
        let seven: Vec<_> = (0..=MAX_FAVORITES)
            .map(|i| input(&format!("s{i}"), "https://a.com"))
            .collect();
        assert!(matches!(
            library.set_favorites(seven),
            Err(Error::TooManyFavorites(_))
        ));
    }

    #[test]
    fn last_url_rejects_non_web_urls() {
        let (_dir, library) = library();
        assert!(library.set_last_url("javascript:1").is_err());
        assert_eq!(library.state().unwrap().last_url, None);
    }

    #[test]
    fn corrupt_or_foreign_files_are_reported_not_overwritten() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("library.json");
        fs::write(&path, "{not json").unwrap();
        assert!(matches!(
            Library::load(path.clone()),
            Err(Error::Corrupt(_))
        ));
        assert_eq!(fs::read_to_string(&path).unwrap(), "{not json");

        let old = r#"{"version":1,"profileId":"6f1a1c1e-0000-4000-8000-00000000000a","favorites":[],"lastUrl":null}"#;
        fs::write(&path, old).unwrap();
        assert!(matches!(
            Library::load(path.clone()),
            Err(Error::UnsupportedVersion(1))
        ));
        assert_eq!(fs::read_to_string(path).unwrap(), old);
    }

    #[test]
    fn the_onboarding_flag_can_be_set_and_reset() {
        let (dir, library) = library();
        assert!(!library.state().unwrap().onboarded);
        library.set_onboarded(true).unwrap();
        assert!(reload(&dir).state().unwrap().onboarded);
        library.set_onboarded(false).unwrap();
        assert!(!reload(&dir).state().unwrap().onboarded);
    }

    #[test]
    fn the_theme_persists_and_defaults_to_system() {
        let (dir, library) = library();
        assert_eq!(library.state().unwrap().theme, Theme::System);
        library.set_theme(Theme::Dark).unwrap();
        assert_eq!(reload(&dir).state().unwrap().theme, Theme::Dark);
    }

    #[test]
    fn icons_are_cached_by_host_and_shown_on_matching_favorites() {
        let (dir, library) = library();
        assert_eq!(library.favorites_missing_icons().unwrap().len(), 4);
        library
            .set_icon("www.reddit.com", "data:image/png;base64,AAAA")
            .unwrap();
        let reddit = reload(&dir)
            .favorites()
            .unwrap()
            .into_iter()
            .find(|f| f.name == "Reddit")
            .unwrap();
        assert_eq!(reddit.icon.as_deref(), Some("data:image/png;base64,AAAA"));
        assert_eq!(library.favorites_missing_icons().unwrap().len(), 3);
    }

    #[test]
    fn only_small_png_data_urls_are_accepted_as_icons() {
        let (_dir, library) = library();
        library
            .set_icon("www.reddit.com", "https://evil.example/x.png")
            .unwrap();
        library
            .set_icon(
                "www.reddit.com",
                &format!("{ICON_PREFIX}{}", "A".repeat(MAX_ICON_CHARS)),
            )
            .unwrap();
        assert_eq!(library.favorites_missing_icons().unwrap().len(), 4);
    }

    #[test]
    fn providers_hold_no_key_and_the_first_becomes_active() {
        let (dir, library) = library();
        let first = library.upsert_provider(provider("Claude")).unwrap();
        let second = library.upsert_provider(provider("Other")).unwrap();
        let settings = reload(&dir).ai_settings().unwrap();
        assert_eq!(settings.providers.len(), 2);
        assert_eq!(settings.active_id, Some(first.id));
        assert!(
            !fs::read_to_string(dir.path().join("library.json"))
                .unwrap()
                .contains("apiKey")
        );
        library.set_active_provider(Some(second.id)).unwrap();
        assert_eq!(library.ai_settings().unwrap().active_id, Some(second.id));
    }

    #[test]
    fn updating_a_provider_keeps_its_id_and_deleting_moves_the_active_one() {
        let (_dir, library) = library();
        let first = library.upsert_provider(provider("Claude")).unwrap();
        let second = library.upsert_provider(provider("Other")).unwrap();
        let mut edit = provider("Renamed");
        edit.id = Some(first.id);
        assert_eq!(library.upsert_provider(edit).unwrap().id, first.id);
        assert_eq!(library.provider(first.id).unwrap().name, "Renamed");
        library.delete_provider(first.id).unwrap();
        assert_eq!(library.ai_settings().unwrap().active_id, Some(second.id));
        assert!(matches!(
            library.delete_provider(first.id),
            Err(Error::ProviderNotFound)
        ));
    }

    #[test]
    fn the_provider_count_is_capped() {
        let (_dir, library) = library();
        for i in 0..MAX_PROVIDERS {
            library.upsert_provider(provider(&format!("p{i}"))).unwrap();
        }
        assert!(matches!(
            library.upsert_provider(provider("one too many")),
            Err(Error::TooManyProviders(_))
        ));
    }
}
