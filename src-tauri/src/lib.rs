mod ad_block;
mod ai;
mod commands;
mod error;
mod library;
mod recipes;
mod secrets;
mod sites;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_siteview::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            app.manage(library::Library::load(data_dir.join("library.json"))?);
            app.manage(recipes::Recipes::load(data_dir.join("recipes"))?);
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
            commands::add_history,
            commands::clear_history,
            commands::complete_onboarding,
            commands::reset_onboarding,
            commands::set_theme,
            commands::refresh_icons,
            commands::open_site,
            commands::set_ad_block,
            commands::get_sites,
            commands::set_site_option,
            commands::save_site_fork,
            commands::restore_site_original,
            commands::set_bottom_margin,
            commands::set_site_bottom_margin,
            commands::bottom_margin_for,
            commands::set_back_button,
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
