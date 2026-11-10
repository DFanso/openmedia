//! Export and import of recipes as text. Import is two steps so the user reviews every rule
//! before anything is saved: `preview_recipe_import` parses and validates, `import_recipes`
//! parses and validates the same text again and saves only the chosen recipes.

use tauri::{AppHandle, State};

use crate::catalog::Catalog;
use crate::commands::reload_script;
use crate::error::Result;
use crate::library::Library;
use crate::recipes::{RecipePreview, Recipes};

/// The bundle text for recipes the user made or changed.
#[tauri::command]
pub fn export_recipes(recipes: State<'_, Recipes>, recipe_ids: Vec<String>) -> Result<String> {
    recipes.export(&recipe_ids)
}

#[tauri::command]
pub fn preview_recipe_import(
    recipes: State<'_, Recipes>,
    text: String,
) -> Result<Vec<RecipePreview>> {
    recipes.preview_import(&text)
}

/// Async for the same reason as `open_site`: reloading the script touches the page views.
#[tauri::command]
pub async fn import_recipes(
    app: AppHandle,
    library: State<'_, Library>,
    recipes: State<'_, Recipes>,
    text: String,
    recipe_ids: Vec<String>,
) -> Result<()> {
    recipes.save_imported(&text, &recipe_ids)?;
    reload_script(&app, &library, &recipes)
}

#[tauri::command]
pub async fn remove_imported_recipe(
    app: AppHandle,
    library: State<'_, Library>,
    recipes: State<'_, Recipes>,
    catalog: State<'_, Catalog>,
    recipe_id: String,
) -> Result<()> {
    catalog.uninstall(&recipes, &recipe_id)?;
    reload_script(&app, &library, &recipes)
}
