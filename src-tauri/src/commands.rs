use tauri::State;

use crate::error::Result;
use crate::library::{AppState, Favorite, FavoriteInput, Library};

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
