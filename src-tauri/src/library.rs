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

const FORMAT_VERSION: u32 = 4;
pub const MAX_FAVORITES: usize = 6;
const MAX_HISTORY: usize = 100;
const MAX_FAVORITE_NAME_CHARS: usize = 20;
const MAX_ICON_CHARS: usize = 200_000;
const ICON_PREFIX: &str = "data:image/png;base64,";

const YOUTUBE_FAVORITE: (&str, &str) = ("YouTube", "https://m.youtube.com/");
const DEFAULT_FAVORITES: [(&str, &str); 5] = [
    ("Instagram", "https://www.instagram.com/"),
    ("Facebook", "https://www.facebook.com/"),
    ("Twitter", "https://twitter.com/"),
    ("Reddit", "https://www.reddit.com/"),
    YOUTUBE_FAVORITE,
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
    pub history: Vec<String>,
    pub last_url: Option<String>,
    pub onboarded: bool,
    pub theme: Theme,
    pub ad_block: bool,
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
    /// On by default; the shell can turn blocking off.
    #[serde(default = "enabled")]
    ad_block: bool,
    /// Site icons by host. They come from the sites themselves and hold nothing private.
    #[serde(default)]
    icons: BTreeMap<String, String>,
    /// Addresses the user typed, newest first.
    #[serde(default)]
    history: Vec<String>,
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
            history: data.history.clone(),
            last_url: data.last_url.clone(),
            onboarded: data.onboarded,
            theme: data.theme,
            ad_block: data.ad_block,
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

    /// Remembers an address the user typed, newest first. A repeat moves to the front rather than
    /// listing twice; the list is capped.
    pub fn add_history(&self, url: &str) -> Result<Vec<String>> {
        let url = parse_web_url(url)?.to_string();
        let mut data = self.lock()?;
        data.history.retain(|seen| *seen != url);
        data.history.insert(0, url);
        data.history.truncate(MAX_HISTORY);
        self.save(&data)?;
        Ok(data.history.clone())
    }

    /// Forgets the searched addresses and the remembered last page, like a browser's "clear
    /// history". Favorites, cookies and settings are untouched.
    pub fn clear_history(&self) -> Result<()> {
        let mut data = self.lock()?;
        data.history.clear();
        data.last_url = None;
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

    pub fn ad_block_enabled(&self) -> Result<bool> {
        Ok(self.lock()?.ad_block)
    }

    pub fn set_ad_block(&self, enabled: bool) -> Result<()> {
        let mut data = self.lock()?;
        data.ad_block = enabled;
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

fn enabled() -> bool {
    true
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
    let mut data: LibraryData = serde_json::from_str(text)?;
    match data.version {
        2 => {
            let previous_defaults = &DEFAULT_FAVORITES[..4];
            if data.favorites.len() == previous_defaults.len()
                && data
                    .favorites
                    .iter()
                    .zip(previous_defaults)
                    .all(|(favorite, (name, url))| favorite.name == *name && favorite.url == *url)
            {
                data.favorites.push(favorite_from_input(FavoriteInput {
                    name: YOUTUBE_FAVORITE.0.to_owned(),
                    url: YOUTUBE_FAVORITE.1.to_owned(),
                })?);
            }
        }
        3 | FORMAT_VERSION => {}
        version => return Err(Error::UnsupportedVersion(version)),
    }
    data.version = FORMAT_VERSION;
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
        ad_block: true,
        icons: BTreeMap::new(),
        history: Vec::new(),
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

pub(crate) fn write_atomically(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
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
    fn youtube_is_available_as_a_favorite_on_first_run() {
        let (_dir, library) = library();
        let youtube = library
            .state()
            .unwrap()
            .favorites
            .into_iter()
            .find(|favorite| favorite.url == "https://m.youtube.com/")
            .expect("YouTube favorite");
        assert_eq!(youtube.name, "YouTube");
    }

    #[test]
    fn upgrading_original_favorites_adds_youtube_without_replacing_their_ids() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("library.json");
        let mut saved = default_data();
        saved.version = 2;
        saved.favorites.pop();
        let originals = saved.favorites.clone();
        let profile = saved.profile_id;
        fs::write(&path, serde_json::to_vec(&saved).unwrap()).unwrap();

        let state = Library::load(path.clone()).unwrap().state().unwrap();
        assert_eq!(state.profile_id, profile);
        assert_eq!(&state.favorites[..4], originals);
        assert_eq!(state.favorites[4].url, "https://m.youtube.com/");
        let saved: LibraryData = serde_json::from_slice(&fs::read(path).unwrap()).unwrap();
        assert_eq!(saved.version, FORMAT_VERSION);
    }

    #[test]
    fn upgrading_does_not_change_custom_or_empty_favorites() {
        let original = default_data().favorites[..4].to_vec();
        let mut reordered = original.clone();
        reordered.swap(0, 1);
        let mut renamed = original.clone();
        renamed[0].name = "Photos".into();
        for favorites in [vec![], original[..3].to_vec(), reordered, renamed] {
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("library.json");
            let mut saved = default_data();
            saved.version = 2;
            saved.favorites = favorites.clone();
            fs::write(&path, serde_json::to_vec(&saved).unwrap()).unwrap();
            assert_eq!(
                Library::load(path).unwrap().state().unwrap().favorites,
                favorites
            );
        }
    }

    #[test]
    fn removing_youtube_is_respected_on_later_launches() {
        let (dir, library) = library();
        let favorites = library
            .state()
            .unwrap()
            .favorites
            .into_iter()
            .filter(|favorite| favorite.name != "YouTube")
            .map(|favorite| input(&favorite.name, &favorite.url))
            .collect();
        let saved = library.set_favorites(favorites).unwrap();
        assert_eq!(reload(&dir).state().unwrap().favorites, saved);
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
    fn ad_blocking_is_on_by_default_and_the_choice_persists() {
        let (dir, library) = library();
        assert!(library.state().unwrap().ad_block);
        library.set_ad_block(false).unwrap();
        assert!(!library.ad_block_enabled().unwrap());
        assert!(!reload(&dir).state().unwrap().ad_block);
    }

    #[test]
    fn a_library_saved_before_ad_blocking_existed_loads_with_it_on() {
        let (dir, library) = library();
        let path = dir.path().join("library.json");
        let mut saved: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert!(saved.as_object_mut().unwrap().remove("adBlock").is_some());
        fs::write(&path, saved.to_string()).unwrap();
        drop(library);
        assert!(reload(&dir).state().unwrap().ad_block);
    }

    #[test]
    fn icons_are_cached_by_host_and_shown_on_matching_favorites() {
        let (dir, library) = library();
        assert!(
            library
                .favorites_missing_icons()
                .unwrap()
                .iter()
                .any(|(host, _)| host == "www.reddit.com")
        );
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
        assert!(
            library
                .favorites_missing_icons()
                .unwrap()
                .iter()
                .all(|(host, _)| host != "www.reddit.com")
        );
    }

    #[test]
    fn only_small_png_data_urls_are_accepted_as_icons() {
        let (_dir, library) = library();
        let before = library.favorites_missing_icons().unwrap();
        library
            .set_icon("www.reddit.com", "https://evil.example/x.png")
            .unwrap();
        library
            .set_icon(
                "www.reddit.com",
                &format!("{ICON_PREFIX}{}", "A".repeat(MAX_ICON_CHARS)),
            )
            .unwrap();
        assert_eq!(library.favorites_missing_icons().unwrap(), before);
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

    #[test]
    fn history_lists_newest_first_and_moves_a_repeat_to_the_front() {
        let (dir, library) = library();
        library.add_history("https://a.example/").unwrap();
        library.add_history("https://b.example/").unwrap();
        let history = library.add_history("https://a.example/").unwrap();
        assert_eq!(history, ["https://a.example/", "https://b.example/"]);
        assert_eq!(reload(&dir).state().unwrap().history, history);
    }

    #[test]
    fn history_is_capped_and_drops_the_oldest() {
        let (_dir, library) = library();
        for i in 0..=MAX_HISTORY {
            library
                .add_history(&format!("https://{i}.example/"))
                .unwrap();
        }
        let history = library.state().unwrap().history;
        assert_eq!(history.len(), MAX_HISTORY);
        assert_eq!(history[0], format!("https://{MAX_HISTORY}.example/"));
        assert!(!history.contains(&"https://0.example/".to_owned()));
    }

    #[test]
    fn history_rejects_non_web_addresses_and_stays_unchanged() {
        let (_dir, library) = library();
        library.add_history("https://a.example/").unwrap();
        assert!(library.add_history("javascript:alert(1)").is_err());
        assert_eq!(library.state().unwrap().history, ["https://a.example/"]);
    }

    #[test]
    fn clearing_history_forgets_the_last_page_but_keeps_favorites() {
        let (dir, library) = library();
        library.add_history("https://a.example/").unwrap();
        library.set_last_url("https://a.example/").unwrap();
        let favorites = library.state().unwrap().favorites;
        library.clear_history().unwrap();
        let state = reload(&dir).state().unwrap();
        assert!(state.history.is_empty());
        assert_eq!(state.last_url, None);
        assert_eq!(state.favorites, favorites);
    }

    #[test]
    fn a_version_three_library_loads_with_empty_history() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("library.json");
        let mut saved = serde_json::to_value(default_data()).unwrap();
        saved["version"] = 3.into();
        saved.as_object_mut().unwrap().remove("history");
        fs::write(&path, serde_json::to_vec(&saved).unwrap()).unwrap();
        let library = Library::load(path.clone()).unwrap();
        assert!(library.state().unwrap().history.is_empty());
        let saved: LibraryData = serde_json::from_slice(&fs::read(path).unwrap()).unwrap();
        assert_eq!(saved.version, FORMAT_VERSION);
    }
}
