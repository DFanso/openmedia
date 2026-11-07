use tauri::{AppHandle, State};
use tauri_plugin_siteview::{
    OpenRequest, Rect, SiteviewExt,
    validate::{parse_profile_id, parse_web_url},
};

use crate::error::Result;
use crate::library::{AppState, Favorite, FavoriteInput, Library};
use crate::recipes::RecipeScript;

#[tauri::command]
pub fn get_state(library: State<'_, Library>) -> Result<AppState> {
    library.state()
}

#[tauri::command]
pub fn set_favorites(
    library: State<'_, Library>,
    favorites: Vec<FavoriteInput>,
) -> Result<Vec<Favorite>> {
    library.set_favorites(favorites)
}

#[tauri::command]
pub fn set_last_url(library: State<'_, Library>, url: String) -> Result<()> {
    library.set_last_url(&url)
}

#[tauri::command]
pub fn complete_onboarding(library: State<'_, Library>) -> Result<()> {
    library.set_onboarded()
}

/// Opens the page in the native site view with the recipe script attached. This is the only way
/// the shell can open one: the plugin's own `open` is not granted to it.
///
/// Must be `async`: a synchronous command runs on the main thread, and the plugin call waits for
/// native code that itself needs the main thread, which deadlocks the app.
#[tauri::command]
pub async fn open_site(
    app: AppHandle,
    library: State<'_, Library>,
    script: State<'_, RecipeScript>,
    url: String,
    rect: Rect,
) -> Result<()> {
    let profile = library.state()?.profile_id.to_string();
    parse_profile_id(&profile)?;
    parse_web_url(&url)?;
    app.siteview().open(OpenRequest {
        profile,
        url,
        rect,
        document_start_script: Some(script.as_str().to_owned()),
    })?;
    Ok(())
}
