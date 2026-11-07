use serde::{Serialize, Serializer};

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("invalid url: {0}")]
    InvalidUrl(String),
    #[error("only http and https urls can be opened")]
    UnsupportedScheme,
    #[error("invalid profile id")]
    InvalidProfile,
    #[error("invalid content rule list")]
    InvalidRuleList,
    #[error("bridge message is larger than {0} bytes")]
    BridgeMessageTooLarge(usize),
    #[error("bridge message is not valid json")]
    BridgeMessageInvalid,
    #[cfg(mobile)]
    #[error(transparent)]
    PluginInvoke(#[from] tauri::plugin::mobile::PluginInvokeError),
    #[cfg(desktop)]
    #[error("site views are not implemented on desktop yet")]
    DesktopUnsupported,
}

impl Serialize for Error {
    fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}
