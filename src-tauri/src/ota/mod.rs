//! Over-the-air updates of the web layer (the React shell), on every platform.
//!
//! `scripts/ota.mjs` builds the shell, signs it, and publishes it to a GitHub release. The app
//! downloads a newer one for its own version, verifies the Ed25519 signature against the key
//! compiled in (`ota-public-key.txt`), and serves it from the next launch instead of the copy
//! embedded in the binary. Native code (Rust, Swift, Kotlin, permissions) is not part of a
//! bundle: changing any of it means a new app version, and a bundle only runs on the version it
//! was built for (see [`bundle::open`]).
//!
//! Nothing is applied that the signature does not cover, and nothing here can be reached from a
//! site webview: the commands are app commands, like the rest of the shell's.

mod assets;
mod bundle;
mod client;
pub mod commands;
mod store;

use std::{
    sync::{Arc, OnceLock},
    thread,
    time::Duration,
};

use base64::{Engine, engine::general_purpose::STANDARD};
use tauri::{App, AppHandle, Manager, Runtime};

pub use assets::OtaAssets;

use bundle::{Bundle, PUBLIC_KEY_BYTES};
use store::Store;

const PUBLIC_KEY: &str = include_str!("../../ota-public-key.txt");
/// Keeps the first seconds of a launch for the app; the check is a background nicety.
const LAUNCH_CHECK_DELAY: Duration = Duration::from_secs(10);

/// What the app is running, fixed once at startup.
pub struct Running {
    store: Store,
    runtime: String,
    key: Option<[u8; PUBLIC_KEY_BYTES]>,
    bundle: Option<Bundle>,
}

pub struct Ota {
    running: OnceLock<Running>,
}

impl Ota {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            running: OnceLock::new(),
        })
    }

    /// Called by Tauri once the app exists, which is the first moment the data folder is known.
    /// The window is created just before, so a page request can already be waiting in
    /// [`Ota::running`]; it must not be answered from the embedded shell and then switch.
    fn init<R: Runtime>(&self, app: &App<R>) {
        let runtime = app.package_info().version.to_string();
        let key = parse_key(PUBLIC_KEY);
        let dir = app
            .path()
            .app_data_dir()
            .map(|dir| dir.join("ota"))
            .unwrap_or_else(|_| std::env::temp_dir().join("openmedia-ota"));
        let (store, bundle) = Store::boot(dir, key.as_ref(), &runtime);
        let _ = self.running.set(Running {
            store,
            runtime,
            key,
            bundle,
        });
    }

    /// Blocks until [`Ota::init`] has run; only the thread serving a page request can wait here.
    fn running(&self) -> &Running {
        self.running.wait()
    }
}

fn parse_key(encoded: &str) -> Option<[u8; PUBLIC_KEY_BYTES]> {
    STANDARD.decode(encoded.trim()).ok()?.try_into().ok()
}

/// Looks for a newer bundle a few seconds after launch and keeps it for the next one. Release
/// builds only: a development build runs from the dev server and has nothing to replace.
pub fn check_after_launch<R: Runtime>(app: &AppHandle<R>) {
    if cfg!(debug_assertions) {
        return;
    }
    let ota = Arc::clone(app.state::<Arc<Ota>>().inner());
    thread::spawn(move || {
        thread::sleep(LAUNCH_CHECK_DELAY);
        let _ = tauri::async_runtime::block_on(client::check(ota.running()));
    });
}
