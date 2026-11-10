use std::sync::Arc;

use serde::Serialize;
use tauri::State;

use super::{Ota, client};
use crate::error::Result;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    /// The native app's version; a web bundle only runs on the runtime it was built for.
    runtime_version: String,
    /// The bundle the shell is running from, or `None` for the one compiled into the app.
    running_revision: Option<u64>,
    /// A downloaded bundle that starts with the next launch.
    pending_revision: Option<u64>,
    /// Whether this build can replace itself (`self_update.rs`).
    self_update: bool,
}

#[tauri::command]
pub fn ota_status(ota: State<'_, Arc<Ota>>) -> Status {
    let running = ota.running();
    Status {
        runtime_version: running.runtime.clone(),
        running_revision: running.bundle.as_ref().map(|bundle| bundle.revision),
        pending_revision: running.store.pending(),
        self_update: crate::self_update::AVAILABLE,
    }
}

/// The shell has rendered: the running bundle is good.
#[tauri::command]
pub fn ota_confirm(ota: State<'_, Arc<Ota>>) -> Result<()> {
    ota.running().store.confirm()
}

#[tauri::command]
pub async fn ota_check(ota: State<'_, Arc<Ota>>) -> Result<client::Outcome> {
    client::check(ota.running()).await
}
