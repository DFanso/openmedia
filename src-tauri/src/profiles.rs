//! Profiles: separate sets of everything the user keeps. Each profile has its own favorites and
//! folders, settings, recipes and their choices, history, assistant providers and chats, saved
//! passwords and incognito set, and its own site data store, so its logins and cookies are its
//! own (`security.md`, profile isolation). Usage limits with the settings lock, downloads and
//! purchases belong to the device and are shared by every profile.
//!
//! `profiles.json` in the app data folder lists the profiles and names the active one. The first
//! profile is the one from before profiles existed: its files stay where they were, in the app
//! data folder itself. Every later profile keeps its files in a folder of its own,
//! `profile-data/<id>`. The app holds one `Library`, `Recipes`, `Chats` and `Vault`; a switch
//! puts the next profile's files in their place (`adopt`) and the shell reloads.
//!
//! A profile's id is also the id of its site data store. Deleting a profile deletes its files and
//! secrets at once; its site data is erased through the site view, which cannot erase a store a
//! page still holds, so a store left over is erased again at the next launch, before any page
//! opens.
//!
//! These are app commands: no capability reaches them from a site view.

use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_siteview::{RemoveProfileRequest, SiteviewExt};
use uuid::Uuid;

use crate::ai::chats::Chats;
use crate::boot::Boot;
use crate::commands::{
    Secrets, push_background_media, push_desktop_sites, push_picture_in_picture, reload_script,
};
use crate::error::{Error, Result};
use crate::import_commands::Unlock;
use crate::incognito::Incognito;
use crate::library::{Library, Theme, is_icon_name, write_atomically};
use crate::recipes::Recipes;
use crate::vault::{self, Vault};

const FILE: &str = "profiles.json";
/// Where every profile but the first keeps its files. Not `profiles`: the desktop site view keeps
/// its data folders there.
const DATA_DIR: &str = "profile-data";
const FORMAT_VERSION: u32 = 1;
/// Each profile is a site data store of its own, so their number is bounded.
pub const MAX_PROFILES: usize = 10;
pub const MAX_PROFILE_NAME_CHARS: usize = 20;

const LIBRARY_FILE: &str = "library.json";
const RECIPES_DIR: &str = "recipes";
const CHATS_FILE: &str = "chats.json";
const VAULT_FILE: &str = "passwords.vault";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Profile {
    pub id: Uuid,
    /// `None` only for the first profile until it is named: the shell gives it a name in the
    /// user's language.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// One of the icons the shell draws, by name (`library::is_icon_name`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ProfileInput {
    pub name: String,
    #[serde(default)]
    pub icon: Option<String>,
}

/// What the shell shows: every profile, in the order they were made, and the one in use.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ProfileList {
    pub active: Uuid,
    pub profiles: Vec<Profile>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProfilesData {
    version: u32,
    active: Uuid,
    /// The profile whose files are in the app data folder itself.
    first: Uuid,
    profiles: Vec<Profile>,
    /// Deleted profiles whose site data store is still to be erased.
    #[serde(default)]
    unerased: Vec<Uuid>,
}

/// A profile's stores, read from its files and ready to be adopted.
pub struct ProfileStores {
    pub library: Library,
    pub recipes: Recipes,
    pub chats: Chats,
    pub vault: Vault,
}

pub struct Profiles {
    root: PathBuf,
    data: Mutex<ProfilesData>,
}

impl Profiles {
    /// Reads `profiles.json` in `root`, the app data folder. Without one, the library in `root`
    /// (made now on a first launch) becomes the first profile, under its own id.
    pub fn load(root: PathBuf) -> Result<Self> {
        let (data, created) = match fs::read_to_string(root.join(FILE)) {
            Ok(text) => (parse(&text)?, false),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                let first = Library::load(root.join(LIBRARY_FILE))?.profile_id()?;
                let data = ProfilesData {
                    version: FORMAT_VERSION,
                    active: first,
                    first,
                    profiles: vec![Profile {
                        id: first,
                        name: None,
                        icon: None,
                    }],
                    unerased: Vec::new(),
                };
                (data, true)
            }
            Err(e) => return Err(e.into()),
        };
        let profiles = Self {
            root,
            data: Mutex::new(data),
        };
        if created {
            let data = profiles.lock()?;
            profiles.save(&data)?;
        }
        Ok(profiles)
    }

    pub fn list(&self) -> Result<ProfileList> {
        let data = self.lock()?;
        Ok(list_of(&data))
    }

    pub fn active(&self) -> Result<Uuid> {
        Ok(self.lock()?.active)
    }

    /// The stores of profile `id`, read from its files. A profile whose library is missing gets a
    /// fresh one under its own id, so its site data store stays its own.
    pub fn open(&self, id: Uuid) -> Result<ProfileStores> {
        let data = self.lock()?;
        if !data.profiles.iter().any(|profile| profile.id == id) {
            return Err(Error::UnknownProfile);
        }
        let dir = self.dir(&data, id);
        let library = dir.join(LIBRARY_FILE);
        if !library.exists() {
            Library::create(&library, id, None, Theme::System)?;
        }
        Ok(ProfileStores {
            library: Library::load(library)?,
            recipes: Recipes::load(dir.join(RECIPES_DIR))?,
            chats: Chats::load(dir.join(CHATS_FILE))?,
            vault: Vault::new(dir.join(VAULT_FILE), vault_key(&data, id)),
        })
    }

    /// Adds a profile, in the language and theme given, and returns the list with it last. The
    /// new profile is not switched to.
    pub fn create(
        &self,
        input: ProfileInput,
        locale: Option<String>,
        theme: Theme,
    ) -> Result<ProfileList> {
        let profile = Profile {
            id: Uuid::new_v4(),
            name: Some(checked_name(&input.name)?),
            icon: checked_icon(input.icon.as_deref())?,
        };
        let mut data = self.lock()?;
        if data.profiles.len() >= MAX_PROFILES {
            return Err(Error::TooManyProfiles(MAX_PROFILES));
        }
        let dir = self.dir(&data, profile.id);
        Library::create(&dir.join(LIBRARY_FILE), profile.id, locale, theme)?;
        data.profiles.push(profile);
        if let Err(error) = self.save(&data) {
            data.profiles.pop();
            let _ = fs::remove_dir_all(&dir);
            return Err(error);
        }
        Ok(list_of(&data))
    }

    /// Renames a profile and changes its icon.
    pub fn update(&self, id: Uuid, input: ProfileInput) -> Result<ProfileList> {
        let name = checked_name(&input.name)?;
        let icon = checked_icon(input.icon.as_deref())?;
        let mut data = self.lock()?;
        let profile = data
            .profiles
            .iter_mut()
            .find(|profile| profile.id == id)
            .ok_or(Error::UnknownProfile)?;
        let before = profile.clone();
        profile.name = Some(name);
        profile.icon = icon;
        if let Err(error) = self.save(&data) {
            if let Some(profile) = data.profiles.iter_mut().find(|profile| profile.id == id) {
                *profile = before;
            }
            return Err(error);
        }
        Ok(list_of(&data))
    }

    /// Deletes profile `id` and its files; the profile in use cannot be deleted. Returns the list
    /// and the ids of the secrets the profile kept (its vault key and assistant keys), for the
    /// caller to delete. Its site data store is left to `erase_site_data`.
    pub fn remove(&self, id: Uuid) -> Result<Removed> {
        let mut data = self.lock()?;
        if id == data.active {
            return Err(Error::ActiveProfile);
        }
        let at = data
            .profiles
            .iter()
            .position(|profile| profile.id == id)
            .ok_or(Error::UnknownProfile)?;
        let dir = self.dir(&data, id);
        let mut secrets = vec![vault_key(&data, id)];
        if let Ok(library) = Library::load(dir.join(LIBRARY_FILE)) {
            secrets.extend(library.ai_settings()?.providers.iter().map(|p| p.id));
        }
        let profile = data.profiles.remove(at);
        data.unerased.push(id);
        if let Err(error) = self.save(&data) {
            data.unerased.pop();
            data.profiles.insert(at, profile);
            return Err(error);
        }
        remove_files(&dir, id == data.first)?;
        Ok(Removed {
            list: list_of(&data),
            secrets,
        })
    }

    pub fn set_active(&self, id: Uuid) -> Result<()> {
        let mut data = self.lock()?;
        if !data.profiles.iter().any(|profile| profile.id == id) {
            return Err(Error::UnknownProfile);
        }
        let before = data.active;
        data.active = id;
        if let Err(error) = self.save(&data) {
            data.active = before;
            return Err(error);
        }
        Ok(())
    }

    /// Deleted profiles whose site data store is still to be erased.
    pub fn unerased(&self) -> Result<Vec<Uuid>> {
        Ok(self.lock()?.unerased.clone())
    }

    /// Notes that profile `id`'s site data store is gone.
    pub fn erased(&self, id: Uuid) -> Result<()> {
        let mut data = self.lock()?;
        data.unerased.retain(|unerased| *unerased != id);
        self.save(&data)
    }

    fn dir(&self, data: &ProfilesData, id: Uuid) -> PathBuf {
        if id == data.first {
            self.root.clone()
        } else {
            self.root.join(DATA_DIR).join(id.to_string())
        }
    }

    fn lock(&self) -> Result<MutexGuard<'_, ProfilesData>> {
        self.data.lock().map_err(|_| Error::Poisoned)
    }

    fn save(&self, data: &ProfilesData) -> Result<()> {
        write_atomically(&self.root.join(FILE), &serde_json::to_vec_pretty(data)?)?;
        Ok(())
    }
}

/// What deleting a profile leaves for the caller.
pub struct Removed {
    pub list: ProfileList,
    pub secrets: Vec<Uuid>,
}

fn parse(text: &str) -> Result<ProfilesData> {
    let mut data: ProfilesData = serde_json::from_str(text)?;
    if data.version != FORMAT_VERSION {
        return Err(Error::UnsupportedVersion(data.version));
    }
    if data.profiles.is_empty() {
        data.profiles.push(Profile {
            id: data.first,
            name: None,
            icon: None,
        });
    }
    if !data
        .profiles
        .iter()
        .any(|profile| profile.id == data.active)
    {
        data.active = data.profiles[0].id;
    }
    Ok(data)
}

fn list_of(data: &ProfilesData) -> ProfileList {
    ProfileList {
        active: data.active,
        profiles: data.profiles.clone(),
    }
}

/// The first profile keeps the vault key it had before profiles existed; every other profile's
/// key is stored under its own id.
fn vault_key(data: &ProfilesData, id: Uuid) -> Uuid {
    if id == data.first { vault::KEY_ID } else { id }
}

fn checked_name(name: &str) -> Result<String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > MAX_PROFILE_NAME_CHARS {
        return Err(Error::InvalidProfile);
    }
    Ok(name.to_owned())
}

fn checked_icon(icon: Option<&str>) -> Result<Option<String>> {
    match icon.map(str::trim) {
        None | Some("") => Ok(None),
        Some(icon) if is_icon_name(icon) => Ok(Some(icon.to_owned())),
        Some(_) => Err(Error::InvalidProfile),
    }
}

/// Deletes a profile's files. The first profile's are in the app data folder beside the device's
/// own files, so only they are deleted there; any other profile's folder goes whole.
fn remove_files(dir: &Path, first: bool) -> Result<()> {
    let gone = |result: std::io::Result<()>| match result {
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => Err(error),
        _ => Ok(()),
    };
    if first {
        for file in [LIBRARY_FILE, CHATS_FILE, VAULT_FILE] {
            gone(fs::remove_file(dir.join(file)))?;
        }
        gone(fs::remove_dir_all(dir.join(RECIPES_DIR)))?;
    } else {
        gone(fs::remove_dir_all(dir))?;
    }
    Ok(())
}

/// Erases the site data stores of deleted profiles. One the site view cannot erase yet stays
/// listed, for the next launch.
pub(crate) fn erase_site_data(app: &AppHandle) {
    let profiles = app.state::<Profiles>();
    let Ok(unerased) = profiles.unerased() else {
        return;
    };
    for id in unerased {
        let request = RemoveProfileRequest {
            profile: id.to_string(),
        };
        if app.siteview().remove_profile(request).is_ok() {
            let _ = profiles.erased(id);
        }
    }
}

#[tauri::command(async)]
pub fn profiles_list(profiles: State<'_, Profiles>) -> Result<ProfileList> {
    profiles.list()
}

/// Adds a profile. It starts in the language and theme of the one in use, with everything else
/// at its defaults, and opens on the guide the first time it is switched to.
#[tauri::command(async)]
pub fn profile_create(
    profiles: State<'_, Profiles>,
    library: State<'_, Library>,
    input: ProfileInput,
) -> Result<ProfileList> {
    profiles.create(input, library.locale()?, library.theme()?)
}

#[tauri::command(async)]
pub fn profile_update(
    profiles: State<'_, Profiles>,
    id: Uuid,
    input: ProfileInput,
) -> Result<ProfileList> {
    profiles.update(id, input)
}

/// Deletes a profile that is not in use: its files, its secrets and its site data. Async because
/// erasing the site data waits for native code that needs the main thread.
#[tauri::command]
pub async fn profile_delete(app: AppHandle, id: Uuid) -> Result<ProfileList> {
    let removed = app.state::<Profiles>().remove(id)?;
    let secrets = app.state::<Secrets>();
    for secret in removed.secrets {
        let _ = secrets.0.delete(secret);
    }
    erase_site_data(&app);
    Ok(removed.list)
}

/// Makes profile `id` the one in use. The shell closes every page first and reloads after: the
/// favorites, settings, recipes, chats and passwords it reads from then on are the profile's, and
/// the profile's start page is already opening (`Boot::restart`). Incognito ends, with its private
/// downloads, and the password vault locks. Async because the site view is told at once.
#[tauri::command]
pub async fn profile_switch(app: AppHandle, id: Uuid) -> Result<()> {
    let profiles = app.state::<Profiles>();
    let stores = profiles.open(id)?;
    // The site view is told before anything changes, so a refused change leaves the app as it
    // was rather than half in the new profile.
    push_background_media(&app, stores.library.background_media_sites()?)?;
    push_picture_in_picture(&app, stores.library.picture_in_picture_sites()?)?;
    push_desktop_sites(&app, stores.library.desktop_sites()?)?;
    profiles.set_active(id)?;
    app.state::<Incognito>().leave();
    app.state::<crate::downloads::Manager>().purge_private();
    app.state::<Unlock>().close();
    let library = app.state::<Library>();
    let recipes = app.state::<Recipes>();
    library.adopt(stores.library)?;
    recipes.adopt(stores.recipes);
    app.state::<Chats>().adopt(stores.chats)?;
    app.state::<Vault>().adopt(stores.vault)?;
    reload_script(&app, &library, &recipes)?;
    app.state::<Boot>().restart(&app, &library)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(name: &str, icon: Option<&str>) -> ProfileInput {
        ProfileInput {
            name: name.to_owned(),
            icon: icon.map(str::to_owned),
        }
    }

    fn profiles() -> (tempfile::TempDir, Profiles) {
        let dir = tempfile::tempdir().unwrap();
        let profiles = Profiles::load(dir.path().to_owned()).unwrap();
        (dir, profiles)
    }

    #[test]
    fn an_existing_library_becomes_the_first_profile_and_keeps_its_files() {
        let dir = tempfile::tempdir().unwrap();
        let library = Library::load(dir.path().join(LIBRARY_FILE)).unwrap();
        let id = library.profile_id().unwrap();
        library.set_favorites(vec![]).unwrap();
        drop(library);

        let profiles = Profiles::load(dir.path().to_owned()).unwrap();
        let list = profiles.list().unwrap();
        assert_eq!(list.active, id);
        assert_eq!(
            list.profiles,
            vec![Profile {
                id,
                name: None,
                icon: None
            }]
        );
        let stores = profiles.open(id).unwrap();
        assert_eq!(stores.library.profile_id().unwrap(), id);
        assert!(stores.library.favorites().unwrap().is_empty());
        assert_eq!(
            Profiles::load(dir.path().to_owned())
                .unwrap()
                .list()
                .unwrap(),
            list
        );
    }

    #[test]
    fn a_new_profile_has_its_own_files_store_and_vault_key() {
        let (dir, profiles) = profiles();
        let first = profiles.active().unwrap();
        let list = profiles
            .create(
                input(" Work ", Some("briefcase")),
                Some("de".into()),
                Theme::Dark,
            )
            .unwrap();
        assert_eq!(list.active, first);
        let work = list.profiles[1].clone();
        assert_eq!(work.name.as_deref(), Some("Work"));
        assert_eq!(work.icon.as_deref(), Some("briefcase"));

        let stores = profiles.open(work.id).unwrap();
        let state = stores.library.state().unwrap();
        assert_eq!(state.profile_id, work.id);
        assert!(!state.onboarded);
        assert_eq!(state.locale.as_deref(), Some("de"));
        assert_eq!(state.theme, Theme::Dark);
        stores.library.set_favorites(vec![]).unwrap();
        let folder = dir.path().join(DATA_DIR).join(work.id.to_string());
        assert!(folder.join(LIBRARY_FILE).exists());
        assert!(
            !profiles
                .open(first)
                .unwrap()
                .library
                .favorites()
                .unwrap()
                .is_empty()
        );
        assert_eq!(vault_key(&profiles.lock().unwrap(), first), vault::KEY_ID);
        assert_eq!(vault_key(&profiles.lock().unwrap(), work.id), work.id);
    }

    #[test]
    fn names_and_icons_are_checked() {
        let (_dir, profiles) = profiles();
        for bad in [
            input(" ", None),
            input(&"x".repeat(21), None),
            input("Kids", Some("🧒")),
            input("Kids", Some("Two Words")),
        ] {
            assert!(profiles.create(bad, None, Theme::System).is_err());
        }
        let id = profiles.active().unwrap();
        let list = profiles.update(id, input("Home", Some(" home "))).unwrap();
        assert_eq!(list.profiles[0].name.as_deref(), Some("Home"));
        assert_eq!(list.profiles[0].icon.as_deref(), Some("home"));
        let list = profiles.update(id, input("Home", None)).unwrap();
        assert_eq!(list.profiles[0].icon, None);
        assert!(matches!(
            profiles.update(Uuid::new_v4(), input("X", None)),
            Err(Error::UnknownProfile)
        ));
    }

    #[test]
    fn the_number_of_profiles_is_bounded() {
        let (_dir, profiles) = profiles();
        for n in 1..MAX_PROFILES {
            profiles
                .create(input(&format!("P{n}"), None), None, Theme::System)
                .unwrap();
        }
        assert!(matches!(
            profiles.create(input("One more", None), None, Theme::System),
            Err(Error::TooManyProfiles(_))
        ));
    }

    #[test]
    fn switching_is_remembered_and_only_to_a_known_profile() {
        let (dir, profiles) = profiles();
        let list = profiles
            .create(input("Work", None), None, Theme::System)
            .unwrap();
        let work = list.profiles[1].id;
        profiles.set_active(work).unwrap();
        assert!(profiles.set_active(Uuid::new_v4()).is_err());
        assert!(profiles.open(Uuid::new_v4()).is_err());
        assert_eq!(
            Profiles::load(dir.path().to_owned())
                .unwrap()
                .active()
                .unwrap(),
            work
        );
    }

    #[test]
    fn deleting_removes_the_files_and_hands_back_the_secrets_but_never_the_active_profile() {
        let (dir, profiles) = profiles();
        let first = profiles.active().unwrap();
        let work = profiles
            .create(input("Work", None), None, Theme::System)
            .unwrap()
            .profiles[1]
            .id;
        let provider = profiles
            .open(work)
            .unwrap()
            .library
            .upsert_provider(crate::ai::ProviderInput {
                id: None,
                name: "Mine".into(),
                kind: crate::ai::ProviderKind::OpenAiCompatible,
                base_url: "https://api.example/v1".into(),
                model: None,
            })
            .unwrap()
            .id;
        assert!(matches!(profiles.remove(first), Err(Error::ActiveProfile)));

        let removed = profiles.remove(work).unwrap();
        assert_eq!(removed.list.profiles.len(), 1);
        assert_eq!(removed.secrets, vec![work, provider]);
        assert!(!dir.path().join(DATA_DIR).join(work.to_string()).exists());
        assert_eq!(profiles.unerased().unwrap(), vec![work]);
        profiles.erased(work).unwrap();
        assert!(profiles.unerased().unwrap().is_empty());
    }

    #[test]
    fn deleting_the_first_profile_leaves_the_devices_own_files() {
        let (dir, profiles) = profiles();
        let first = profiles.active().unwrap();
        fs::write(dir.path().join("usage.json"), "{}").unwrap();
        fs::create_dir_all(dir.path().join(RECIPES_DIR)).unwrap();
        let work = profiles
            .create(input("Work", None), None, Theme::System)
            .unwrap()
            .profiles[1]
            .id;
        profiles.set_active(work).unwrap();

        let removed = profiles.remove(first).unwrap();
        assert_eq!(removed.secrets[0], vault::KEY_ID);
        assert!(!dir.path().join(LIBRARY_FILE).exists());
        assert!(!dir.path().join(RECIPES_DIR).exists());
        assert!(dir.path().join("usage.json").exists());
        assert!(dir.path().join(FILE).exists());
        assert!(profiles.open(work).is_ok());
    }
}
