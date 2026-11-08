use tauri::{
    Manager, Runtime,
    plugin::{Builder, TauriPlugin},
};

mod error;
mod models;

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

pub use error::{Error, Result};
pub use models::*;

#[cfg(desktop)]
pub use desktop::Billing;
#[cfg(mobile)]
pub use mobile::Billing;

/// Carries a `Snapshot` each time the store reports a change.
pub const SNAPSHOT_EVENT: &str = "billing:snapshot";

pub trait BillingExt<R: Runtime> {
    fn billing(&self) -> &Billing<R>;
}

impl<R: Runtime, T: Manager<R>> BillingExt<R> for T {
    fn billing(&self) -> &Billing<R> {
        self.state::<Billing<R>>().inner()
    }
}

/// Registers no commands: the plugin is Rust-only, so neither the shell nor a site view can
/// start a purchase or a restore.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("billing")
        .setup(|app, api| {
            #[cfg(mobile)]
            let billing = mobile::init(app, api)?;
            #[cfg(desktop)]
            let billing = desktop::init(app, api)?;
            app.manage(billing);
            Ok(())
        })
        .build()
}
