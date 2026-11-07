use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_siteview::{
    ContentRuleList, FetchFaviconRequest, OpenRequest, Rect, SetContentRuleListsRequest,
    SiteviewExt,
    validate::{parse_profile_id, parse_web_url},
};
use uuid::Uuid;

use crate::ad_block::AdBlock;
use crate::ai::{
    ProviderConfig, ProviderInput,
    connection::{list_models, models_request},
    validate_key,
};
use crate::error::{Error, Result};
use crate::library::{AppState, Favorite, FavoriteInput, Library, Theme};
use crate::recipes::RecipeScript;
use crate::secrets::SecretStore;

/// The secret store, behind a trait so tests can swap it.
pub struct Secrets(pub Box<dyn SecretStore>);

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
    library.set_onboarded(true)
}

#[tauri::command]
pub fn reset_onboarding(library: State<'_, Library>) -> Result<()> {
    library.set_onboarded(false)
}

#[tauri::command]
pub fn set_theme(library: State<'_, Library>, theme: Theme) -> Result<()> {
    library.set_theme(theme)
}

/// Fetches icons for favorites that have none, from the sites themselves. Async because it calls
/// native code (see `open_site`).
#[tauri::command]
pub async fn refresh_icons(app: AppHandle, library: State<'_, Library>) -> Result<Vec<Favorite>> {
    for (host, url) in library.favorites_missing_icons()? {
        if let Ok(Some(icon)) = app.siteview().fetch_favicon(FetchFaviconRequest { url }) {
            library.set_icon(&host, &icon)?;
        }
    }
    library.favorites()
}

/// The site view reports its errors on this event; the shell shows them in a banner.
const SITE_ERROR_EVENT: &str = "siteview:error";

/// Builds the rule lists on a blocking thread: the first run converts the bundled lists, which
/// parses several megabytes.
async fn build_rule_lists(ad_block: &AdBlock) -> Result<Vec<ContentRuleList>> {
    let ad_block = ad_block.clone();
    tauri::async_runtime::spawn_blocking(move || ad_block.rule_lists())
        .await
        .map_err(|e| Error::AdBlock(e.to_string()))?
}

/// Opens the page in the native site view with the recipe script and the ad-blocking rule lists
/// attached. This is the only way the shell can open one: the plugin's own `open` is not granted
/// to it.
///
/// A failure to build the rule lists does not stop browsing; the page opens unblocked and the shell
/// is told why.
///
/// Must be `async`: a synchronous command runs on the main thread, and the plugin call waits for
/// native code that itself needs the main thread, which deadlocks the app.
#[tauri::command]
pub async fn open_site(
    app: AppHandle,
    library: State<'_, Library>,
    script: State<'_, RecipeScript>,
    ad_block: State<'_, AdBlock>,
    url: String,
    rect: Rect,
) -> Result<()> {
    let profile = library.state()?.profile_id.to_string();
    parse_profile_id(&profile)?;
    parse_web_url(&url)?;
    let mut blocking_failure = None;
    let content_rule_lists = if library.ad_block_enabled()? {
        build_rule_lists(&ad_block).await.unwrap_or_else(|e| {
            blocking_failure = Some(e.to_string());
            Vec::new()
        })
    } else {
        Vec::new()
    };
    app.siteview().open(OpenRequest {
        profile,
        url,
        rect,
        document_start_script: Some(script.as_str().to_owned()),
        content_rule_lists,
    })?;
    if let Some(message) = blocking_failure {
        let _ = app.emit(SITE_ERROR_EVENT, message);
    }
    Ok(())
}

/// Turns ad blocking on or off. An open page reloads under the new setting. Async for the same
/// reason as `open_site`.
#[tauri::command]
pub async fn set_ad_block(
    app: AppHandle,
    library: State<'_, Library>,
    ad_block: State<'_, AdBlock>,
    enabled: bool,
) -> Result<()> {
    let lists = if enabled {
        build_rule_lists(&ad_block).await?
    } else {
        Vec::new()
    };
    app.siteview()
        .set_content_rule_lists(SetContentRuleListsRequest { lists })?;
    library.set_ad_block(enabled)
}

/// Shows or hides the floating back button. The shell draws it; nothing native changes.
#[tauri::command]
pub fn set_back_button(library: State<'_, Library>, enabled: bool) -> Result<()> {
    library.set_back_button(enabled)
}

/// A provider as the shell sees it: settings plus whether a key exists, never the key itself.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderView {
    #[serde(flatten)]
    config: ProviderConfig,
    has_key: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiState {
    providers: Vec<ProviderView>,
    active_id: Option<Uuid>,
}

fn save_key(library: &Library, store: &dyn SecretStore, id: Uuid, key: &str) -> Result<()> {
    library.provider(id)?;
    validate_key(key)?;
    store.set(id, key)
}

fn forget_provider(library: &Library, store: &dyn SecretStore, id: Uuid) -> Result<()> {
    library.delete_provider(id)?;
    store.delete(id)
}

fn view(secrets: &Secrets, config: ProviderConfig) -> Result<ProviderView> {
    let has_key = secrets.0.exists(config.id)?;
    Ok(ProviderView { config, has_key })
}

#[tauri::command]
pub fn ai_state(library: State<'_, Library>, secrets: State<'_, Secrets>) -> Result<AiState> {
    let settings = library.ai_settings()?;
    Ok(AiState {
        providers: settings
            .providers
            .into_iter()
            .map(|config| view(&secrets, config))
            .collect::<Result<_>>()?,
        active_id: settings.active_id,
    })
}

#[tauri::command]
pub fn ai_save_provider(
    library: State<'_, Library>,
    secrets: State<'_, Secrets>,
    provider: ProviderInput,
) -> Result<ProviderView> {
    view(&secrets, library.upsert_provider(provider)?)
}

#[tauri::command]
pub fn ai_delete_provider(
    library: State<'_, Library>,
    secrets: State<'_, Secrets>,
    id: Uuid,
) -> Result<()> {
    forget_provider(&library, secrets.0.as_ref(), id)
}

/// The key travels shell to Rust once and is written straight to the secure store. It is never
/// returned, logged, or put in an error.
#[tauri::command]
pub fn ai_set_key(
    library: State<'_, Library>,
    secrets: State<'_, Secrets>,
    id: Uuid,
    key: String,
) -> Result<()> {
    save_key(&library, secrets.0.as_ref(), id, &key)
}

#[tauri::command]
pub fn ai_remove_key(
    library: State<'_, Library>,
    secrets: State<'_, Secrets>,
    id: Uuid,
) -> Result<()> {
    library.provider(id)?;
    secrets.0.delete(id)
}

#[tauri::command]
pub fn ai_set_active(library: State<'_, Library>, id: Option<Uuid>) -> Result<()> {
    library.set_active_provider(id)
}

/// Asks the provider for its model list: proves the key works and returns the choices.
#[tauri::command]
pub async fn ai_test(
    library: State<'_, Library>,
    secrets: State<'_, Secrets>,
    id: Uuid,
) -> Result<Vec<String>> {
    let provider = library.provider(id)?;
    let key = secrets.0.get(id)?.ok_or(Error::NoKey)?;
    list_models(models_request(provider.kind, &provider.base_url, &key)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::ProviderKind;
    use crate::secrets::MemoryStore;

    fn setup() -> (tempfile::TempDir, Library, Secrets, ProviderConfig) {
        let dir = tempfile::tempdir().unwrap();
        let library = Library::load(dir.path().join("library.json")).unwrap();
        let provider = library
            .upsert_provider(ProviderInput {
                id: None,
                name: "Claude".into(),
                kind: ProviderKind::Anthropic,
                base_url: "https://api.anthropic.com".into(),
                model: None,
            })
            .unwrap();
        (
            dir,
            library,
            Secrets(Box::new(MemoryStore::default())),
            provider,
        )
    }

    #[test]
    fn a_saved_key_is_reported_as_present_but_never_serialized() {
        let (_dir, library, secrets, provider) = setup();
        assert!(!view(&secrets, provider.clone()).unwrap().has_key);
        save_key(
            &library,
            secrets.0.as_ref(),
            provider.id,
            "sk-ant-very-secret",
        )
        .unwrap();
        let shown = view(&secrets, provider).unwrap();
        assert!(shown.has_key);
        assert!(
            !serde_json::to_string(&shown)
                .unwrap()
                .contains("very-secret")
        );
    }

    #[test]
    fn the_key_never_reaches_the_library_file() {
        let (dir, library, secrets, provider) = setup();
        save_key(
            &library,
            secrets.0.as_ref(),
            provider.id,
            "sk-ant-very-secret",
        )
        .unwrap();
        let file = std::fs::read_to_string(dir.path().join("library.json")).unwrap();
        assert!(!file.contains("very-secret"));
    }

    #[test]
    fn bad_keys_and_unknown_providers_are_refused() {
        let (_dir, library, secrets, provider) = setup();
        assert!(save_key(&library, secrets.0.as_ref(), provider.id, "two words").is_err());
        assert!(save_key(&library, secrets.0.as_ref(), Uuid::new_v4(), "sk-fine").is_err());
        assert!(!secrets.0.exists(provider.id).unwrap());
    }

    #[test]
    fn deleting_a_provider_deletes_its_key() {
        let (_dir, library, secrets, provider) = setup();
        save_key(&library, secrets.0.as_ref(), provider.id, "sk-ant-abc").unwrap();
        forget_provider(&library, secrets.0.as_ref(), provider.id).unwrap();
        assert!(!secrets.0.exists(provider.id).unwrap());
        assert!(library.provider(provider.id).is_err());
    }
}
