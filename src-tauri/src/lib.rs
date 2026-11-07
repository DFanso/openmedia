mod ad_block;
mod ai;
mod commands;
mod error;
mod library;
mod recipes;
mod secrets;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_siteview::init())
        .setup(|app| {
            let path = app.path().app_data_dir()?.join("library.json");
            app.manage(library::Library::load(path)?);
            app.manage(recipes::RecipeScript::bundled()?);
            app.manage(ad_block::AdBlock::bundled(
                app.path().app_cache_dir()?.join("ad-block"),
            ));
            app.manage(commands::Secrets(Box::new(secrets::KeychainStore)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_state,
            commands::set_favorites,
            commands::set_last_url,
            commands::complete_onboarding,
            commands::reset_onboarding,
            commands::set_theme,
            commands::refresh_icons,
            commands::open_site,
            commands::set_ad_block,
            commands::ai_state,
            commands::ai_save_provider,
            commands::ai_delete_provider,
            commands::ai_set_key,
            commands::ai_remove_key,
            commands::ai_set_active,
            commands::ai_test,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
