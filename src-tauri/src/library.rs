use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
};

use serde::{Deserialize, Serialize};
use tauri_plugin_siteview::validate::parse_web_url;
use uuid::Uuid;

use crate::error::{Error, Result};

const FORMAT_VERSION: u32 = 2;
pub const MAX_FAVORITES: usize = 6;
const MAX_FAVORITE_NAME_CHARS: usize = 20;

const DEFAULT_FAVORITES: [(&str, &str); 4] = [
    ("Instagram", "https://www.instagram.com/"),
    ("Facebook", "https://www.facebook.com/"),
    ("Twitter", "https://twitter.com/"),
    ("Reddit", "https://www.reddit.com/"),
];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Favorite {
    pub id: Uuid,
    pub name: String,
    pub url: String,
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
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LibraryData {
    version: u32,
    profile_id: Uuid,
    favorites: Vec<Favorite>,
    last_url: Option<String>,
}

/// The user's favorites and last page, persisted as one JSON file. Holds no secrets and no
/// cookies: site sessions live in the native data store of `profile_id`.
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
            favorites: data.favorites.clone(),
            last_url: data.last_url.clone(),
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
        data.favorites = favorites.clone();
        self.save(&data)?;
        Ok(favorites)
    }

    pub fn set_last_url(&self, url: &str) -> Result<()> {
        let url = parse_web_url(url)?.to_string();
        let mut data = self.lock()?;
        data.last_url = Some(url);
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
            })
            .collect(),
        last_url: None,
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

    fn library() -> (tempfile::TempDir, Library) {
        let dir = tempfile::tempdir().unwrap();
        let library = Library::load(dir.path().join("library.json")).unwrap();
        (dir, library)
    }

    fn input(name: &str, url: &str) -> FavoriteInput {
        FavoriteInput {
            name: name.into(),
            url: url.into(),
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
        let reloaded = Library::load(dir.path().join("library.json")).unwrap();
        assert_eq!(reloaded.state().unwrap().profile_id, first);
    }

    #[test]
    fn edited_favorites_and_last_url_survive_a_reload() {
        let (dir, library) = library();
        library
            .set_favorites(vec![input(" YouTube ", "https://m.youtube.com")])
            .unwrap();
        library.set_last_url("https://m.youtube.com/feed").unwrap();
        let state = Library::load(dir.path().join("library.json"))
            .unwrap()
            .state()
            .unwrap();
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
}
