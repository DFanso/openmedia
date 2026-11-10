//! Where downloaded bundles live and which one runs.
//!
//! A downloaded bundle is *pending*: it replaces nothing until the next launch, so the page the
//! user is looking at never changes under them. At that launch it becomes *active* but
//! unconfirmed. The shell confirms once it has rendered (`ota_confirm`); an active bundle that
//! failed to confirm on [`MAX_UNCONFIRMED_LAUNCHES`] launches in a row is deleted and the embedded
//! shell runs again, so a broken bundle cannot lock the user out.
//!
//! Every failure here falls back to the embedded shell: an update is never worth a broken app.

use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard, PoisonError},
};

use serde::{Deserialize, Serialize};

use super::bundle::{self, Bundle, PUBLIC_KEY_BYTES};
use crate::error::{Error, Result};

pub const MAX_UNCONFIRMED_LAUNCHES: u32 = 2;
const STATE_FILE: &str = "state.json";
const BUNDLE_EXTENSION: &str = "ota";

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct State {
    active: Option<u64>,
    pending: Option<u64>,
    confirmed: bool,
    unconfirmed_launches: u32,
}

pub struct Store {
    dir: PathBuf,
    state: Mutex<State>,
}

impl Store {
    /// Applies a pending bundle, applies the rollback rule, and returns the bundle to serve, if
    /// any. Never fails: whatever cannot be used is deleted and the embedded shell runs.
    pub fn boot(
        dir: PathBuf,
        key: Option<&[u8; PUBLIC_KEY_BYTES]>,
        runtime: &str,
    ) -> (Self, Option<Bundle>) {
        let mut state = read_state(&dir);
        if let Some(pending) = state.pending.take() {
            state.active = Some(pending);
            state.confirmed = false;
            state.unconfirmed_launches = 0;
        }
        let tried_enough =
            !state.confirmed && state.unconfirmed_launches >= MAX_UNCONFIRMED_LAUNCHES;
        let bundle = state
            .active
            .filter(|_| !tried_enough)
            .zip(key)
            .and_then(|(revision, key)| read_bundle(&dir, revision, key, runtime).ok());
        match &bundle {
            Some(_) if !state.confirmed => state.unconfirmed_launches += 1,
            Some(_) => {}
            None => state = State::default(),
        }
        remove_unused(&dir, &state);
        let store = Self {
            dir,
            state: Mutex::new(state),
        };
        // A state that cannot be saved only costs the rollback counter; the bundle was verified.
        let _ = store.save(&store.lock());
        (store, bundle)
    }

    /// The newest revision this device already holds, running or waiting.
    pub fn newest(&self) -> u64 {
        let state = self.lock();
        state.pending.max(state.active).unwrap_or(0)
    }

    pub fn pending(&self) -> Option<u64> {
        self.lock().pending
    }

    /// Keeps a verified bundle for the next launch.
    pub fn stage(&self, revision: u64, packed: &[u8]) -> Result<()> {
        fs::create_dir_all(&self.dir)?;
        let target = bundle_path(&self.dir, revision);
        let partial = target.with_extension("partial");
        fs::write(&partial, packed)?;
        fs::rename(&partial, &target)?;
        let mut state = self.lock();
        if let Some(replaced) = state.pending.replace(revision)
            && replaced != revision
            && state.active != Some(replaced)
        {
            let _ = fs::remove_file(bundle_path(&self.dir, replaced));
        }
        self.save(&state)
    }

    /// The shell rendered from the active bundle: stop counting launches against it.
    pub fn confirm(&self) -> Result<()> {
        let mut state = self.lock();
        if state.active.is_none() || state.confirmed {
            return Ok(());
        }
        state.confirmed = true;
        state.unconfirmed_launches = 0;
        self.save(&state)
    }

    fn lock(&self) -> MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn save(&self, state: &State) -> Result<()> {
        fs::create_dir_all(&self.dir)?;
        let partial = self.dir.join("state.partial");
        fs::write(&partial, serde_json::to_vec(state)?)?;
        fs::rename(&partial, self.dir.join(STATE_FILE))?;
        Ok(())
    }
}

fn bundle_path(dir: &Path, revision: u64) -> PathBuf {
    dir.join(format!("{revision}.{BUNDLE_EXTENSION}"))
}

fn read_state(dir: &Path) -> State {
    fs::read(dir.join(STATE_FILE))
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn read_bundle(
    dir: &Path,
    revision: u64,
    key: &[u8; PUBLIC_KEY_BYTES],
    runtime: &str,
) -> Result<Bundle> {
    let packed = fs::read(bundle_path(dir, revision))?;
    let bundle = bundle::open(&packed, key, runtime)?;
    if bundle.revision == revision {
        Ok(bundle)
    } else {
        Err(Error::Ota(
            "the update is not the revision it was saved as".into(),
        ))
    }
}

/// Deletes every saved bundle the state does not name.
fn remove_unused(dir: &Path, state: &State) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let revision = path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .and_then(|stem| stem.parse::<u64>().ok());
        let is_bundle = path.extension().is_some_and(|ext| ext == BUNDLE_EXTENSION);
        let used = revision.is_some_and(|r| state.active == Some(r) || state.pending == Some(r));
        if is_bundle && !used {
            let _ = fs::remove_file(path);
        }
    }
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use base64::{Engine, engine::general_purpose::STANDARD};
    use flate2::{Compression, write::GzEncoder};
    use ring::{
        rand::SystemRandom,
        signature::{Ed25519KeyPair, KeyPair},
    };
    use serde_json::json;
    use tempfile::TempDir;

    use super::*;

    const RUNTIME: &str = "1.0.0";

    struct Fixture {
        dir: TempDir,
        pair: Ed25519KeyPair,
    }

    impl Fixture {
        fn new() -> Self {
            let pkcs8 = Ed25519KeyPair::generate_pkcs8(&SystemRandom::new()).unwrap();
            Self {
                dir: TempDir::new().unwrap(),
                pair: Ed25519KeyPair::from_pkcs8(pkcs8.as_ref()).unwrap(),
            }
        }

        fn key(&self) -> [u8; PUBLIC_KEY_BYTES] {
            self.pair.public_key().as_ref().try_into().unwrap()
        }

        fn packed(&self, revision: u64, runtime: &str) -> Vec<u8> {
            let manifest = json!({
                "format": 1,
                "runtimeVersion": runtime,
                "revision": revision,
                "files": { "index.html": STANDARD.encode(format!("rev {revision}")) },
            });
            let mut gzip = GzEncoder::new(Vec::new(), Compression::fast());
            gzip.write_all(manifest.to_string().as_bytes()).unwrap();
            let compressed = gzip.finish().unwrap();
            let message = [b"openmedia-ota-v1\n".as_slice(), &compressed].concat();
            [self.pair.sign(&message).as_ref(), &compressed].concat()
        }

        fn boot(&self) -> (Store, Option<Bundle>) {
            Store::boot(self.dir.path().to_path_buf(), Some(&self.key()), RUNTIME)
        }

        fn stage(&self, revision: u64) {
            let (store, _) = self.boot();
            store
                .stage(revision, &self.packed(revision, RUNTIME))
                .unwrap();
        }
    }

    fn running(bundle: Option<Bundle>) -> Option<u64> {
        bundle.map(|b| b.revision)
    }

    #[test]
    fn a_fresh_install_runs_the_embedded_shell() {
        let fixture = Fixture::new();
        assert_eq!(running(fixture.boot().1), None);
    }

    #[test]
    fn a_staged_bundle_waits_for_the_next_launch() {
        let fixture = Fixture::new();
        let (store, bundle) = fixture.boot();
        assert!(bundle.is_none());
        store.stage(5, &fixture.packed(5, RUNTIME)).unwrap();
        assert_eq!(store.pending(), Some(5));
        assert_eq!(store.newest(), 5);
        assert_eq!(running(fixture.boot().1), Some(5));
    }

    #[test]
    fn a_newer_bundle_replaces_the_running_one_and_the_old_file_goes() {
        let fixture = Fixture::new();
        fixture.stage(5);
        let (store, _) = fixture.boot();
        store.confirm().unwrap();
        store.stage(6, &fixture.packed(6, RUNTIME)).unwrap();
        assert_eq!(running(fixture.boot().1), Some(6));
        assert!(!bundle_path(fixture.dir.path(), 5).exists());
    }

    #[test]
    fn an_unconfirmed_bundle_is_dropped_after_two_launches() {
        let fixture = Fixture::new();
        fixture.stage(5);
        assert_eq!(running(fixture.boot().1), Some(5));
        assert_eq!(running(fixture.boot().1), Some(5));
        assert_eq!(running(fixture.boot().1), None);
        assert!(!bundle_path(fixture.dir.path(), 5).exists());
        assert_eq!(running(fixture.boot().1), None);
    }

    #[test]
    fn a_confirmed_bundle_keeps_running() {
        let fixture = Fixture::new();
        fixture.stage(5);
        for _ in 0..5 {
            let (store, bundle) = fixture.boot();
            assert_eq!(running(bundle), Some(5));
            store.confirm().unwrap();
        }
    }

    #[test]
    fn a_bundle_for_another_runtime_is_dropped() {
        let fixture = Fixture::new();
        let (store, _) = fixture.boot();
        store.stage(5, &fixture.packed(5, "0.9.0")).unwrap();
        assert_eq!(running(fixture.boot().1), None);
        assert!(!bundle_path(fixture.dir.path(), 5).exists());
    }

    #[test]
    fn a_tampered_file_is_dropped() {
        let fixture = Fixture::new();
        fixture.stage(5);
        let path = bundle_path(fixture.dir.path(), 5);
        let mut bytes = fs::read(&path).unwrap();
        let last = bytes.len() - 1;
        bytes[last] ^= 1;
        fs::write(path, bytes).unwrap();
        assert_eq!(running(fixture.boot().1), None);
    }

    #[test]
    fn a_corrupt_state_file_runs_the_embedded_shell() {
        let fixture = Fixture::new();
        fixture.stage(5);
        fs::write(fixture.dir.path().join(STATE_FILE), "{not json").unwrap();
        assert_eq!(running(fixture.boot().1), None);
        assert!(!bundle_path(fixture.dir.path(), 5).exists());
    }

    #[test]
    fn a_file_saved_under_another_revision_is_dropped() {
        let fixture = Fixture::new();
        let (store, _) = fixture.boot();
        store.stage(5, &fixture.packed(9, RUNTIME)).unwrap();
        assert_eq!(running(fixture.boot().1), None);
    }
}
