use uuid::Uuid;
use zeroize::Zeroizing;

use crate::error::{Error, Result};

const SERVICE: &str = "surf.openmedia";

/// Where API keys live. Keys go in and come out only through this trait, and only Rust code
/// calls it: no command returns a key to the shell.
pub trait SecretStore: Send + Sync {
    fn set(&self, id: Uuid, secret: &str) -> Result<()>;
    fn get(&self, id: Uuid) -> Result<Option<Zeroizing<String>>>;
    fn delete(&self, id: Uuid) -> Result<()>;

    fn exists(&self, id: Uuid) -> Result<bool> {
        Ok(self.get(id)?.is_some())
    }
}

/// The OS secure store: the Keychain on iOS and macOS.
pub struct KeychainStore;

impl KeychainStore {
    fn entry(id: Uuid) -> Result<keyring::Entry> {
        keyring::Entry::new(SERVICE, &format!("ai-provider:{id}"))
            .map_err(|e| Error::Secret(e.to_string()))
    }
}

impl SecretStore for KeychainStore {
    fn set(&self, id: Uuid, secret: &str) -> Result<()> {
        Self::entry(id)?
            .set_password(secret)
            .map_err(|e| Error::Secret(e.to_string()))
    }

    fn get(&self, id: Uuid) -> Result<Option<Zeroizing<String>>> {
        match Self::entry(id)?.get_password() {
            Ok(secret) => Ok(Some(Zeroizing::new(secret))),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(Error::Secret(e.to_string())),
        }
    }

    fn delete(&self, id: Uuid) -> Result<()> {
        match Self::entry(id)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(Error::Secret(e.to_string())),
        }
    }
}

#[cfg(test)]
pub use memory::MemoryStore;

#[cfg(test)]
mod memory {
    use std::{collections::HashMap, sync::Mutex};

    use super::*;

    #[derive(Default)]
    pub struct MemoryStore(Mutex<HashMap<Uuid, String>>);

    impl SecretStore for MemoryStore {
        fn set(&self, id: Uuid, secret: &str) -> Result<()> {
            self.0.lock().unwrap().insert(id, secret.to_owned());
            Ok(())
        }

        fn get(&self, id: Uuid) -> Result<Option<Zeroizing<String>>> {
            Ok(self.0.lock().unwrap().get(&id).cloned().map(Zeroizing::new))
        }

        fn delete(&self, id: Uuid) -> Result<()> {
            self.0.lock().unwrap().remove(&id);
            Ok(())
        }
    }
}
