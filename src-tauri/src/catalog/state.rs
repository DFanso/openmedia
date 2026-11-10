use std::{
    collections::BTreeMap,
    fs,
    path::PathBuf,
    sync::{Mutex, PoisonError},
};

use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::library::write_atomically;

const MAX_TOKEN_CHARS: usize = 64;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct Data {
    /// The newest catalog sequence this device accepted; an older one is a replay.
    sequence: u64,
    /// Marketplace recipe id to the SHA-256 of the exact file installed, so a revocation in a
    /// later catalog can find it.
    installed: BTreeMap<String, String>,
    /// Marketplace recipe id to the token that lets this device submit new versions of it. It
    /// grants a place in the review queue, never publication.
    edit_tokens: BTreeMap<String, String>,
    count_installs: bool,
}

impl Default for Data {
    fn default() -> Self {
        Self {
            sequence: 0,
            installed: BTreeMap::new(),
            edit_tokens: BTreeMap::new(),
            count_installs: true,
        }
    }
}

/// What the marketplace client remembers between runs, in `catalog-state.json`.
pub struct State {
    path: PathBuf,
    data: Mutex<Data>,
}

impl State {
    /// A missing or unreadable file is a fresh start: nothing here is needed to use the app.
    pub fn load(path: PathBuf) -> Self {
        let data = fs::read_to_string(&path)
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default();
        Self {
            path,
            data: Mutex::new(data),
        }
    }

    pub fn sequence(&self) -> u64 {
        self.read(|data| data.sequence)
    }

    /// Remembers a newer sequence. An older one never lowers it.
    pub fn accept_sequence(&self, sequence: u64) -> Result<()> {
        self.update(|data| data.sequence = data.sequence.max(sequence))
    }

    pub fn installed(&self) -> BTreeMap<String, String> {
        self.read(|data| data.installed.clone())
    }

    pub fn record_install(&self, id: &str, sha256: &str) -> Result<()> {
        self.update(|data| {
            data.installed.insert(id.to_owned(), sha256.to_owned());
        })
    }

    pub fn forget(&self, id: &str) -> Result<()> {
        self.update(|data| {
            data.installed.remove(id);
        })
    }

    pub fn edit_token(&self, id: &str) -> Option<String> {
        self.read(|data| data.edit_tokens.get(id).cloned())
    }

    /// Keeps a token the server handed out, if it has the shape of one.
    pub fn set_edit_token(&self, id: &str, token: &str) -> Result<()> {
        let well_formed = !token.is_empty()
            && token.len() <= MAX_TOKEN_CHARS
            && token
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_');
        if !well_formed {
            return Ok(());
        }
        self.update(|data| {
            data.edit_tokens.insert(id.to_owned(), token.to_owned());
        })
    }

    pub fn count_installs(&self) -> bool {
        self.read(|data| data.count_installs)
    }

    pub fn set_count_installs(&self, on: bool) -> Result<()> {
        self.update(|data| data.count_installs = on)
    }

    fn read<T>(&self, f: impl FnOnce(&Data) -> T) -> T {
        f(&self.data.lock().unwrap_or_else(PoisonError::into_inner))
    }

    fn update(&self, f: impl FnOnce(&mut Data)) -> Result<()> {
        let mut data = self.data.lock().unwrap_or_else(PoisonError::into_inner);
        f(&mut data);
        write_atomically(&self.path, &serde_json::to_vec_pretty(&*data)?)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state() -> (tempfile::TempDir, State) {
        let dir = tempfile::tempdir().unwrap();
        let state = State::load(dir.path().join("catalog-state.json"));
        (dir, state)
    }

    #[test]
    fn the_sequence_only_ever_goes_up_and_survives_a_restart() {
        let (dir, state) = state();
        state.accept_sequence(7).unwrap();
        state.accept_sequence(3).unwrap();
        assert_eq!(state.sequence(), 7);
        let restarted = State::load(dir.path().join("catalog-state.json"));
        assert_eq!(restarted.sequence(), 7);
    }

    #[test]
    fn installs_are_recorded_and_forgotten() {
        let (_dir, state) = state();
        state.record_install("market.a", "abc").unwrap();
        assert_eq!(
            state.installed().get("market.a").map(String::as_str),
            Some("abc")
        );
        state.forget("market.a").unwrap();
        assert!(state.installed().is_empty());
    }

    #[test]
    fn counting_installs_starts_on_and_can_be_turned_off() {
        let (dir, state) = state();
        assert!(state.count_installs());
        state.set_count_installs(false).unwrap();
        assert!(!State::load(dir.path().join("catalog-state.json")).count_installs());
    }

    #[test]
    fn only_token_shaped_text_is_kept() {
        let (_dir, state) = state();
        state.set_edit_token("market.a", "abc_DEF-123").unwrap();
        assert_eq!(state.edit_token("market.a").as_deref(), Some("abc_DEF-123"));
        state.set_edit_token("market.b", "has space").unwrap();
        state.set_edit_token("market.c", &"x".repeat(65)).unwrap();
        assert_eq!(state.edit_token("market.b"), None);
        assert_eq!(state.edit_token("market.c"), None);
    }

    #[test]
    fn a_damaged_file_is_a_fresh_start() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("catalog-state.json");
        fs::write(&path, "{ not json").unwrap();
        let state = State::load(path);
        assert_eq!(state.sequence(), 0);
        assert!(state.count_installs());
    }
}
