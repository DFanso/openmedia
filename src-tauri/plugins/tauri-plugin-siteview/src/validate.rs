use url::Url;
use uuid::Uuid;

use crate::{Error, Result};

pub const MAX_BRIDGE_MESSAGE_BYTES: usize = 64 * 1024;

pub fn parse_web_url(input: &str) -> Result<Url> {
    let url = Url::parse(input).map_err(|e| Error::InvalidUrl(e.to_string()))?;
    match url.scheme() {
        "http" | "https" => Ok(url),
        _ => Err(Error::UnsupportedScheme),
    }
}

pub fn parse_profile_id(input: &str) -> Result<Uuid> {
    Uuid::parse_str(input).map_err(|_| Error::InvalidProfile)
}

pub fn parse_bridge_body(body: &str) -> Result<serde_json::Value> {
    if body.len() > MAX_BRIDGE_MESSAGE_BYTES {
        return Err(Error::BridgeMessageTooLarge(MAX_BRIDGE_MESSAGE_BYTES));
    }
    serde_json::from_str(body).map_err(|_| Error::BridgeMessageInvalid)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_http_and_https() {
        assert!(parse_web_url("https://www.instagram.com/").is_ok());
        assert!(parse_web_url("http://example.com/a?b=1").is_ok());
    }

    #[test]
    fn rejects_non_web_schemes() {
        for input in [
            "javascript:alert(1)",
            "file:///etc/passwd",
            "data:text/html,hi",
            "ipc://localhost/x",
            "tauri://localhost",
        ] {
            assert!(
                matches!(parse_web_url(input), Err(Error::UnsupportedScheme)),
                "{input}"
            );
        }
    }

    #[test]
    fn rejects_garbage_and_empty_hosts() {
        for input in ["not a url", "http://", "https://:443/"] {
            assert!(
                matches!(parse_web_url(input), Err(Error::InvalidUrl(_))),
                "{input}"
            );
        }
    }

    #[test]
    fn profile_ids_must_be_uuids() {
        assert!(parse_profile_id("6f1a1c1e-0000-4000-8000-00000000000a").is_ok());
        assert!(matches!(
            parse_profile_id("../../etc"),
            Err(Error::InvalidProfile)
        ));
    }

    #[test]
    fn bridge_body_is_size_capped_and_must_be_json() {
        assert_eq!(
            parse_bridge_body(r#"{"a":1}"#).unwrap(),
            serde_json::json!({"a": 1})
        );
        assert!(matches!(
            parse_bridge_body("{oops"),
            Err(Error::BridgeMessageInvalid)
        ));
        let huge = format!("\"{}\"", "x".repeat(MAX_BRIDGE_MESSAGE_BYTES));
        assert!(matches!(
            parse_bridge_body(&huge),
            Err(Error::BridgeMessageTooLarge(_))
        ));
    }
}
