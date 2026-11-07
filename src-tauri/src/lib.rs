mod commands;
mod error;
mod library;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_siteview::init())
        .setup(|app| {
            let path = app.path().app_data_dir()?.join("library.json");
            app.manage(library::Library::load(path)?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_state,
            commands::set_favorites,
            commands::set_last_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
