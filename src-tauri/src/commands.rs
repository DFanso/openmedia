use tauri::{AppHandle, State};
use tauri_plugin_siteview::{DeleteProfileDataRequest, SiteviewExt};
use uuid::Uuid;

use crate::error::Result;
use crate::library::{Library, Profile, Site};

#[tauri::command]
pub fn list_profiles(library: State<'_, Library>) -> Result<Vec<Profile>> {
    library.profiles()
}

#[tauri::command]
pub fn create_profile(library: State<'_, Library>, name: String) -> Result<Profile> {
    library.create_profile(&name)
}

#[tauri::command]
pub fn delete_profile(app: AppHandle, library: State<'_, Library>, profile_id: Uuid) -> Result<()> {
    library.can_delete_profile(profile_id)?;
    app.siteview()
        .delete_profile_data(DeleteProfileDataRequest {
            profile: profile_id.to_string(),
        })?;
    library.delete_profile(profile_id)
}

#[tauri::command]
pub fn add_site(library: State<'_, Library>, profile_id: Uuid, url: String) -> Result<Site> {
    library.add_site(profile_id, &url)
}

#[tauri::command]
pub fn remove_site(library: State<'_, Library>, profile_id: Uuid, site_id: Uuid) -> Result<()> {
    library.remove_site(profile_id, site_id)
}
