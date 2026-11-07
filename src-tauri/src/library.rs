use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
};

use serde::{Deserialize, Serialize};
use tauri_plugin_siteview::validate::parse_web_url;
use uuid::Uuid;

use crate::error::{Error, Result};

const DEFAULT_PROFILE_NAME: &str = "Personal";
const MAX_PROFILE_NAME_CHARS: usize = 40;
const FORMAT_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Site {
    pub id: Uuid,
    pub url: String,
    pub title: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Profile {
    pub id: Uuid,
    pub name: String,
    pub sites: Vec<Site>,
}

#[derive(Debug, Serialize, Deserialize)]
struct LibraryData {
    version: u32,
    profiles: Vec<Profile>,
}

/// Profiles and their saved sites, persisted as one JSON file. Holds no secrets and no cookies:
/// site sessions live in the native per-profile data store.
pub struct Library {
    path: PathBuf,
    data: Mutex<LibraryData>,
}

impl Library {
    pub fn load(path: PathBuf) -> Result<Self> {
        let data = match fs::read_to_string(&path) {
            Ok(text) => serde_json::from_str(&text)?,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => LibraryData {
                version: FORMAT_VERSION,
                profiles: vec![new_profile(DEFAULT_PROFILE_NAME)],
            },
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

    pub fn profiles(&self) -> Result<Vec<Profile>> {
        Ok(self.lock()?.profiles.clone())
    }

    pub fn create_profile(&self, name: &str) -> Result<Profile> {
        let name = name.trim();
        if name.is_empty() || name.chars().count() > MAX_PROFILE_NAME_CHARS {
            return Err(Error::InvalidProfileName);
        }
        let mut data = self.lock()?;
        if data
            .profiles
            .iter()
            .any(|p| p.name.to_lowercase() == name.to_lowercase())
        {
            return Err(Error::DuplicateProfileName);
        }
        let profile = new_profile(name);
        data.profiles.push(profile.clone());
        self.save(&data)?;
        Ok(profile)
    }

    pub fn can_delete_profile(&self, id: Uuid) -> Result<()> {
        let data = self.lock()?;
        if !data.profiles.iter().any(|p| p.id == id) {
            return Err(Error::ProfileNotFound);
        }
        if data.profiles.len() == 1 {
            return Err(Error::LastProfile);
        }
        Ok(())
    }

    pub fn delete_profile(&self, id: Uuid) -> Result<()> {
        self.can_delete_profile(id)?;
        let mut data = self.lock()?;
        data.profiles.retain(|p| p.id != id);
        self.save(&data)
    }

    pub fn add_site(&self, profile_id: Uuid, url: &str) -> Result<Site> {
        let parsed = parse_web_url(url)?;
        let host = parsed.host_str().unwrap_or_default();
        let site = Site {
            id: Uuid::new_v4(),
            url: parsed.to_string(),
            title: host.strip_prefix("www.").unwrap_or(host).to_owned(),
        };
        let mut data = self.lock()?;
        data.profile_mut(profile_id)?.sites.push(site.clone());
        self.save(&data)?;
        Ok(site)
    }

    pub fn remove_site(&self, profile_id: Uuid, site_id: Uuid) -> Result<()> {
        let mut data = self.lock()?;
        let sites = &mut data.profile_mut(profile_id)?.sites;
        let before = sites.len();
        sites.retain(|s| s.id != site_id);
        if sites.len() == before {
            return Err(Error::SiteNotFound);
        }
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

impl LibraryData {
    fn profile_mut(&mut self, id: Uuid) -> Result<&mut Profile> {
        self.profiles
            .iter_mut()
            .find(|p| p.id == id)
            .ok_or(Error::ProfileNotFound)
    }
}

fn new_profile(name: &str) -> Profile {
    Profile {
        id: Uuid::new_v4(),
        name: name.to_owned(),
        sites: Vec::new(),
    }
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

    #[test]
    fn first_run_creates_one_default_profile() {
        let (_dir, library) = library();
        let profiles = library.profiles().unwrap();
        assert_eq!(profiles.len(), 1);
        assert_eq!(profiles[0].name, "Personal");
    }

    #[test]
    fn changes_survive_a_reload() {
        let (dir, library) = library();
        let profile = library.profiles().unwrap().remove(0);
        library
            .add_site(profile.id, "https://www.instagram.com/")
            .unwrap();
        let reloaded = Library::load(dir.path().join("library.json")).unwrap();
        let sites = reloaded.profiles().unwrap().remove(0).sites;
        assert_eq!(sites.len(), 1);
        assert_eq!(sites[0].title, "instagram.com");
    }

    #[test]
    fn site_urls_must_be_web_urls() {
        let (_dir, library) = library();
        let profile = library.profiles().unwrap().remove(0);
        assert!(library.add_site(profile.id, "javascript:alert(1)").is_err());
        assert!(library.add_site(profile.id, "file:///etc/passwd").is_err());
        assert!(library.profiles().unwrap()[0].sites.is_empty());
    }

    #[test]
    fn profile_names_are_trimmed_unique_and_bounded() {
        let (_dir, library) = library();
        assert!(matches!(
            library.create_profile("   "),
            Err(Error::InvalidProfileName)
        ));
        assert!(matches!(
            library.create_profile(&"x".repeat(41)),
            Err(Error::InvalidProfileName)
        ));
        assert!(matches!(
            library.create_profile(" personal "),
            Err(Error::DuplicateProfileName)
        ));
        assert_eq!(library.create_profile(" Work ").unwrap().name, "Work");
    }

    #[test]
    fn the_last_profile_cannot_be_deleted() {
        let (_dir, library) = library();
        let only = library.profiles().unwrap().remove(0);
        assert!(matches!(
            library.delete_profile(only.id),
            Err(Error::LastProfile)
        ));
        let work = library.create_profile("Work").unwrap();
        library.delete_profile(only.id).unwrap();
        assert_eq!(library.profiles().unwrap(), vec![work]);
    }

    #[test]
    fn sites_are_scoped_to_their_profile() {
        let (_dir, library) = library();
        let personal = library.profiles().unwrap().remove(0);
        let work = library.create_profile("Work").unwrap();
        let site = library
            .add_site(personal.id, "https://youtube.com")
            .unwrap();
        assert!(matches!(
            library.remove_site(work.id, site.id),
            Err(Error::SiteNotFound)
        ));
        library.remove_site(personal.id, site.id).unwrap();
    }

    #[test]
    fn a_corrupt_library_is_reported_not_overwritten() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("library.json");
        fs::write(&path, "{not json").unwrap();
        assert!(matches!(
            Library::load(path.clone()),
            Err(Error::Corrupt(_))
        ));
        assert_eq!(fs::read_to_string(path).unwrap(), "{not json");
    }
}
