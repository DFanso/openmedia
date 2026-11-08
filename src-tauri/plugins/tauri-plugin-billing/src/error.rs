use serde::{Serialize, Serializer};

pub type Result<T> = std::result::Result<T, Error>;

/// Messages here reach the UI, so none of them may contain a key or a receipt.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[cfg(desktop)]
    #[error("purchases are not supported on desktop")]
    Unsupported,
    #[error("unknown package")]
    InvalidPackage,
    #[cfg(mobile)]
    #[error(transparent)]
    PluginInvoke(#[from] tauri::plugin::mobile::PluginInvokeError),
}

impl Serialize for Error {
    fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}
