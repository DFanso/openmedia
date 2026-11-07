use serde::{Serialize, Serializer};

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("profile name must be 1-40 characters")]
    InvalidProfileName,
    #[error("a profile with that name already exists")]
    DuplicateProfileName,
    #[error("profile not found")]
    ProfileNotFound,
    #[error("site not found")]
    SiteNotFound,
    #[error("at least one profile must remain")]
    LastProfile,
    #[error(transparent)]
    SiteView(#[from] tauri_plugin_siteview::Error),
    #[error("could not read or write the library: {0}")]
    Storage(#[from] std::io::Error),
    #[error("the library file is corrupt: {0}")]
    Corrupt(#[from] serde_json::Error),
    #[error("library lock poisoned")]
    Poisoned,
}

impl Serialize for Error {
    fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}
