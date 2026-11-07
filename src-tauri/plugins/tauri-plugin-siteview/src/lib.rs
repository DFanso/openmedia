use tauri::{
    Manager, Runtime,
    plugin::{Builder, TauriPlugin},
};

mod commands;
mod error;
mod models;
pub mod validate;

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

pub use error::{Error, Result};
pub use models::*;

#[cfg(desktop)]
use desktop::Siteview;
#[cfg(mobile)]
use mobile::Siteview;

pub trait SiteviewExt<R: Runtime> {
    fn siteview(&self) -> &Siteview<R>;
}

impl<R: Runtime, T: Manager<R>> SiteviewExt<R> for T {
    fn siteview(&self) -> &Siteview<R> {
        self.state::<Siteview<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("siteview")
        .invoke_handler(tauri::generate_handler![
            commands::open,
            commands::close,
            commands::set_rect,
            commands::set_interactive_regions,
            commands::navigate,
            commands::go_back,
            commands::go_forward,
            commands::reload,
            commands::set_color_scheme,
            commands::fetch_favicon,
        ])
        .setup(|app, api| {
            #[cfg(mobile)]
            let siteview = mobile::init(app, api)?;
            #[cfg(desktop)]
            let siteview = desktop::init(app, api)?;
            app.manage(siteview);
            Ok(())
        })
        .build()
}
