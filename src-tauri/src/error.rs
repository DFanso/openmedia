use serde::{Serialize, Serializer};

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("a favorite needs a name of 1-20 characters")]
    InvalidFavoriteName,
    #[error("at most {0} favorites are allowed")]
    TooManyFavorites(usize),
    #[error(transparent)]
    SiteView(#[from] tauri_plugin_siteview::Error),
    #[error("could not read or write the library: {0}")]
    Storage(#[from] std::io::Error),
    #[error("the library file is corrupt: {0}")]
    Corrupt(#[from] serde_json::Error),
    #[error("the library file has unsupported version {0}")]
    UnsupportedVersion(u32),
    #[error("invalid recipe: {0}")]
    Recipe(String),
    #[error("library lock poisoned")]
    Poisoned,
}

impl Serialize for Error {
    fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}
