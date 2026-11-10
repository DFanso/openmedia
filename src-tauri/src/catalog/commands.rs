//! Shell-facing marketplace commands. None of them is reachable from a site view: the shell
//! capability names only the `main` webview. Async so network waits stay off the main thread.

use tauri::{AppHandle, State};

use super::{Catalog, Listing, ReportReason, Status, Submitted};
use crate::commands::reload_script;
use crate::error::Result;
use crate::library::Library;
use crate::recipes::{RecipePreview, Recipes};

#[tauri::command]
pub fn marketplace_status(catalog: State<'_, Catalog>) -> Status {
    catalog.status()
}

#[tauri::command]
pub fn marketplace_set_counting(catalog: State<'_, Catalog>, enabled: bool) -> Result<()> {
    catalog.set_count_installs(enabled)
}

/// Fetches the signed catalog. If it withdrew a recipe that is installed, that recipe is gone
/// from this device and the page script is rebuilt without it.
#[tauri::command]
pub async fn marketplace_list(
    app: AppHandle,
    catalog: State<'_, Catalog>,
    recipes: State<'_, Recipes>,
    library: State<'_, Library>,
) -> Result<Listing> {
    let listing = catalog.refresh(&recipes).await?;
    if !listing.withdrawn.is_empty() {
        reload_script(&app, &library, &recipes)?;
    }
    Ok(listing)
}

#[tauri::command]
pub async fn marketplace_preview(
    catalog: State<'_, Catalog>,
    recipes: State<'_, Recipes>,
    recipe_id: String,
) -> Result<RecipePreview> {
    catalog.preview(&recipes, &recipe_id).await
}

#[tauri::command]
pub async fn marketplace_install(
    app: AppHandle,
    catalog: State<'_, Catalog>,
    recipes: State<'_, Recipes>,
    library: State<'_, Library>,
    recipe_id: String,
) -> Result<()> {
    catalog.install(&recipes, &recipe_id).await?;
    reload_script(&app, &library, &recipes)
}

#[tauri::command]
pub async fn marketplace_uninstall(
    app: AppHandle,
    catalog: State<'_, Catalog>,
    recipes: State<'_, Recipes>,
    library: State<'_, Library>,
    recipe_id: String,
) -> Result<()> {
    catalog.uninstall(&recipes, &recipe_id)?;
    reload_script(&app, &library, &recipes)
}

#[tauri::command]
pub async fn marketplace_report(
    catalog: State<'_, Catalog>,
    recipe_id: String,
    reason: ReportReason,
) -> Result<()> {
    catalog.report(&recipe_id, reason).await
}

/// Sends one of the user's own recipes for review. The reply says whether this was the first
/// submission under that name; the edit token itself never reaches the shell.
#[tauri::command]
pub async fn marketplace_submit(
    catalog: State<'_, Catalog>,
    recipes: State<'_, Recipes>,
    recipe_id: String,
    slug: String,
    summary: String,
    author: String,
) -> Result<SubmitResult> {
    let submitted: Submitted = catalog
        .submit(&recipes, &recipe_id, &slug, &summary, &author)
        .await?;
    Ok(SubmitResult {
        submission_id: submitted.submission_id,
        first_submission: submitted.edit_token.is_some(),
    })
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitResult {
    pub submission_id: String,
    pub first_submission: bool,
}
