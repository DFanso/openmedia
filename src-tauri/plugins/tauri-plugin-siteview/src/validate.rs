use std::path::Path;

use url::Url;
use uuid::Uuid;

use crate::{ContentRuleList, Error, Result};

pub const MAX_BRIDGE_MESSAGE_BYTES: usize = 64 * 1024;
pub const MAX_RULE_LISTS: usize = 8;
const MAX_RULE_LIST_ID_CHARS: usize = 64;

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

/// Session ids come from the shell; they are UUIDs so they are safe to log and to use as map keys.
pub fn parse_session_id(input: &str) -> Result<Uuid> {
    Uuid::parse_str(input).map_err(|_| Error::InvalidSession)
}

pub fn parse_bridge_body(body: &str) -> Result<serde_json::Value> {
    if body.len() > MAX_BRIDGE_MESSAGE_BYTES {
        return Err(Error::BridgeMessageTooLarge(MAX_BRIDGE_MESSAGE_BYTES));
    }
    serde_json::from_str(body).map_err(|_| Error::BridgeMessageInvalid)
}

/// Rule lists come from Rust, never from a page, but the native side reads `path` and hands it to
/// WebKit, so the shape is checked here anyway: a short id from a safe alphabet and an absolute
/// path to a `.json` file.
pub fn validate_rule_lists(lists: &[ContentRuleList]) -> Result<()> {
    if lists.len() > MAX_RULE_LISTS {
        return Err(Error::InvalidRuleList);
    }
    for list in lists {
        let id_ok = !list.id.is_empty()
            && list.id.len() <= MAX_RULE_LIST_ID_CHARS
            && list
                .id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.');
        let path = Path::new(&list.path);
        let path_ok = path.is_absolute() && path.extension().is_some_and(|e| e == "json");
        if !id_ok || !path_ok {
            return Err(Error::InvalidRuleList);
        }
    }
    Ok(())
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
    fn session_ids_must_be_uuids() {
        assert!(parse_session_id("6f1a1c1e-0000-4000-8000-00000000000a").is_ok());
        assert!(matches!(
            parse_session_id("main"),
            Err(Error::InvalidSession)
        ));
    }

    fn list(id: &str, path: &str) -> ContentRuleList {
        ContentRuleList {
            id: id.to_owned(),
            path: path.to_owned(),
        }
    }

    #[test]
    fn rule_lists_need_a_safe_id_and_an_absolute_json_path() {
        assert!(
            validate_rule_lists(&[list("openmedia-easylist-1a2b", "/data/x/easylist.json")])
                .is_ok()
        );
        assert!(validate_rule_lists(&[]).is_ok());
        for bad in [
            list("", "/data/x.json"),
            list("has space", "/data/x.json"),
            list("../escape", "/data/x.json"),
            list(&"a".repeat(65), "/data/x.json"),
            list("ok", "relative/x.json"),
            list("ok", "/data/x.txt"),
            list("ok", "/data/x"),
        ] {
            assert!(
                matches!(
                    validate_rule_lists(std::slice::from_ref(&bad)),
                    Err(Error::InvalidRuleList)
                ),
                "{bad:?}"
            );
        }
    }

    #[test]
    fn rule_lists_are_capped() {
        let many = vec![list("ok", "/data/x.json"); MAX_RULE_LISTS + 1];
        assert!(matches!(
            validate_rule_lists(&many),
            Err(Error::InvalidRuleList)
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
