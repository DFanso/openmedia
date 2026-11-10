//! Replaces the desktop app itself, for builds distributed outside the stores. The store builds
//! (iOS, Android, Mac App Store) are updated by their store, which forbids self-replacement, so
//! they are compiled without the `self-update` feature and these commands answer
//! `SelfUpdateUnavailable`. `scripts/ota.mjs app` builds and publishes the feature-enabled
//! builds; `latest.json` on the repository's latest release tells them what is new, and the
//! updater plugin checks its Minisign signature before anything is installed.
//!
//! Only the shell can start either step: the plugin's own JS commands carry no capability.

use serde::Serialize;
use tauri::{AppHandle, Runtime};

use crate::error::Result;

#[cfg(all(desktop, feature = "self-update"))]
pub const AVAILABLE: bool = true;
#[cfg(not(all(desktop, feature = "self-update")))]
pub const AVAILABLE: bool = false;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Available {
    version: String,
    notes: Option<String>,
}

#[tauri::command]
pub async fn app_update_check<R: Runtime>(app: AppHandle<R>) -> Result<Option<Available>> {
    imp::check(&app).await
}

/// Downloads the update, installs it, and restarts the app.
#[tauri::command]
pub async fn app_update_install<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    imp::install(&app).await
}

#[cfg(all(desktop, feature = "self-update"))]
mod imp {
    use tauri_plugin_updater::{Update, UpdaterExt};

    use super::*;
    use crate::error::Error;

    async fn newest<R: Runtime>(app: &AppHandle<R>) -> Result<Option<Update>> {
        let updater = app
            .updater()
            .map_err(|_| Error::Connection("Could not check for updates.".into()))?;
        updater
            .check()
            .await
            .map_err(|_| Error::Connection("Could not check for updates.".into()))
    }

    pub async fn check<R: Runtime>(app: &AppHandle<R>) -> Result<Option<Available>> {
        Ok(newest(app).await?.map(|update| Available {
            version: update.version,
            notes: update.body,
        }))
    }

    pub async fn install<R: Runtime>(app: &AppHandle<R>) -> Result<()> {
        let Some(update) = newest(app).await? else {
            return Ok(());
        };
        update
            .download_and_install(|_, _| {}, || {})
            .await
            .map_err(|_| Error::Ota("the update could not be installed".into()))?;
        app.restart()
    }
}

#[cfg(not(all(desktop, feature = "self-update")))]
mod imp {
    use super::*;
    use crate::error::Error;

    pub async fn check<R: Runtime>(_app: &AppHandle<R>) -> Result<Option<Available>> {
        Err(Error::SelfUpdateUnavailable)
    }

    pub async fn install<R: Runtime>(_app: &AppHandle<R>) -> Result<()> {
        Err(Error::SelfUpdateUnavailable)
    }
}
