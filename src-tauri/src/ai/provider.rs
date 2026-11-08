//! Calls the user's chosen provider from Rust. The key never leaves this module except inside the
//! request headers, is held in zeroizing buffers, and no error text contains a response body, a
//! header or the key.

use std::time::Duration;

use serde_json::Value;
use zeroize::Zeroizing;

use super::{
    ProviderConfig, ProviderKind, anthropic, connection::describe_status, normalize_base_url,
    openai, prompt::Prompt, validate_key,
};
use crate::error::{Error, Result};

const MAX_BODY_BYTES: usize = 2 * 1024 * 1024;

pub(super) const MSG_NETWORK: &str = "Could not reach the provider.";
pub(super) const MSG_SECURE: &str = "Could not start a secure connection.";
pub(super) const MSG_REFUSED: &str = "The model declined to answer.";
pub(super) const MSG_STRUCTURE: &str = "The model's answer was not in the expected form.";
pub(super) const MSG_UNREADABLE: &str = "The provider's answer was not understood.";
pub(super) const MSG_NO_MODEL: &str = "Choose a model for this provider in Settings first.";
pub(super) const MSG_BAD_REQUEST: &str = "The provider rejected the request. Check the model name.";
pub(super) const MSG_OVERLOADED: &str = "The provider is overloaded. Try again shortly.";

/// A request as plain data so its shape can be checked without a network. `Debug` hides every
/// header value, because one of them is the key.
pub(super) struct ApiRequest {
    pub url: String,
    pub headers: Vec<(&'static str, Zeroizing<String>)>,
    pub body: Value,
}

impl std::fmt::Debug for ApiRequest {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let names: Vec<&str> = self.headers.iter().map(|(name, _)| *name).collect();
        f.debug_struct("ApiRequest")
            .field("url", &self.url)
            .field("headers", &names)
            .finish_non_exhaustive()
    }
}

pub(super) fn failure(message: &str) -> Error {
    Error::Connection(message.to_owned())
}

/// What the user is told for an HTTP status. Never includes the response body.
pub(super) fn status_error(status: u16) -> Error {
    Error::Connection(match status {
        400 | 413 | 422 => MSG_BAD_REQUEST.to_owned(),
        529 => MSG_OVERLOADED.to_owned(),
        other => describe_status(other),
    })
}

pub(super) fn model_of(config: &ProviderConfig) -> Result<&str> {
    config
        .model
        .as_deref()
        .filter(|model| !model.is_empty())
        .ok_or_else(|| failure(MSG_NO_MODEL))
}

/// Asks the provider for a patch and returns the JSON text of the model's answer. The caller
/// validates it with [`super::patch::parse_patch`]; nothing here trusts it.
pub async fn complete(
    config: &ProviderConfig,
    key: &str,
    prompt: &Prompt,
    schema: &Value,
) -> Result<String> {
    if key.is_empty() {
        return Err(Error::NoKey);
    }
    validate_key(key)?;
    let base = normalize_base_url(&config.base_url)?;
    let client = client()?;
    match config.kind {
        ProviderKind::Anthropic => {
            anthropic::complete(&client, &base, config, key, prompt, schema).await
        }
        ProviderKind::OpenAiCompatible => {
            openai::complete(&client, &base, config, key, prompt, schema).await
        }
    }
}

fn client() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(120))
        // A redirect could carry the key to another host.
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| failure(MSG_SECURE))
}

/// Sends the request and returns the status with the body as JSON (`Null` when it is not JSON).
/// The body is read up to a cap and is never turned into an error message.
pub(super) async fn send(client: &reqwest::Client, request: &ApiRequest) -> Result<(u16, Value)> {
    let mut builder = client.post(&request.url).json(&request.body);
    for (name, value) in &request.headers {
        builder = builder.header(*name, value.as_str());
    }
    let mut response = builder.send().await.map_err(|_| failure(MSG_NETWORK))?;
    let status = response.status().as_u16();
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| failure(MSG_NETWORK))? {
        bytes.extend_from_slice(&chunk);
        if bytes.len() > MAX_BODY_BYTES {
            return Err(failure(MSG_UNREADABLE));
        }
    }
    Ok((
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    ))
}

/// A one-thread HTTP server on loopback for adapter tests: answers each request with the next
/// canned response and records what it was sent.
#[cfg(test)]
pub(super) mod test_server {
    use std::{
        io::{Read, Write},
        net::TcpListener,
        sync::{Arc, Mutex},
        thread,
    };

    use super::{Prompt, ProviderConfig, ProviderKind};

    pub fn config(kind: ProviderKind, base: &str, model: Option<&str>) -> ProviderConfig {
        ProviderConfig {
            id: uuid::Uuid::nil(),
            name: "test".into(),
            kind,
            base_url: base.into(),
            model: model.map(str::to_owned),
        }
    }

    pub fn prompt() -> Prompt {
        Prompt {
            system: "SYSTEM TEXT".into(),
            user: "USER TEXT".into(),
            version: 1,
        }
    }

    #[derive(Debug, Clone)]
    pub struct Seen {
        pub request_line: String,
        pub headers: String,
        pub body: String,
    }

    pub struct Server {
        pub base: String,
        pub seen: Arc<Mutex<Vec<Seen>>>,
    }

    pub fn serve(responses: Vec<(u16, String)>) -> Server {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let seen = Arc::new(Mutex::new(Vec::new()));
        let log = Arc::clone(&seen);
        thread::spawn(move || {
            for (status, body) in responses {
                let Ok((mut stream, _)) = listener.accept() else {
                    return;
                };
                let mut raw = Vec::new();
                let mut buf = [0_u8; 4096];
                let (head_end, length) = loop {
                    let n = stream.read(&mut buf).unwrap_or(0);
                    raw.extend_from_slice(&buf[..n]);
                    let text = String::from_utf8_lossy(&raw).into_owned();
                    if let Some(end) = text.find("\r\n\r\n") {
                        let length = text[..end]
                            .lines()
                            .find_map(|l| {
                                l.to_ascii_lowercase()
                                    .strip_prefix("content-length:")
                                    .map(|v| v.trim().parse::<usize>().unwrap_or(0))
                            })
                            .unwrap_or(0);
                        break (end + 4, length);
                    }
                    if n == 0 {
                        return;
                    }
                };
                while raw.len() < head_end + length {
                    let n = stream.read(&mut buf).unwrap_or(0);
                    if n == 0 {
                        break;
                    }
                    raw.extend_from_slice(&buf[..n]);
                }
                let text = String::from_utf8_lossy(&raw).into_owned();
                let (head, body_text) = text.split_at(head_end.min(text.len()));
                let mut lines = head.lines();
                log.lock().unwrap().push(Seen {
                    request_line: lines.next().unwrap_or("").to_owned(),
                    headers: lines.collect::<Vec<_>>().join("\n"),
                    body: body_text.to_owned(),
                });
                let reply = format!(
                    "HTTP/1.1 {status} X\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
                    body.len()
                );
                let _ = stream.write_all(reply.as_bytes());
            }
        });
        Server { base, seen }
    }
}

#[cfg(test)]
mod tests {
    use super::test_server::{config, prompt};
    use super::*;
    use crate::ai::patch::patch_schema;
    use serde_json::json;

    fn run(config: &ProviderConfig, key: &str) -> Result<String> {
        tauri::async_runtime::block_on(complete(config, key, &prompt(), &patch_schema()))
    }

    #[test]
    fn missing_and_malformed_keys_and_models_fail_before_any_request() {
        let ok = config(
            ProviderKind::Anthropic,
            "https://api.anthropic.com",
            Some("m"),
        );
        assert!(matches!(run(&ok, ""), Err(Error::NoKey)));
        assert!(matches!(run(&ok, "has space"), Err(Error::InvalidKey(_))));
        let no_model = config(ProviderKind::Anthropic, "https://api.anthropic.com", None);
        let err = run(&no_model, "sk-test").unwrap_err().to_string();
        assert_eq!(err, MSG_NO_MODEL);
        let plain_http = config(ProviderKind::Anthropic, "http://example.com", Some("m"));
        assert!(run(&plain_http, "sk-test").is_err());
    }

    #[test]
    fn status_errors_are_fixed_texts() {
        for (status, needle) in [
            (401, "rejected the key"),
            (403, "rejected the key"),
            (429, "rate limiting"),
            (500, "server error"),
            (503, "server error"),
            (529, "overloaded"),
            (400, "Check the model"),
            (404, "base URL"),
        ] {
            let text = status_error(status).to_string();
            assert!(text.contains(needle), "{status}: {text}");
        }
    }

    #[test]
    fn debug_output_hides_the_key() {
        let request = ApiRequest {
            url: "https://x.test".into(),
            headers: vec![("x-api-key", Zeroizing::new("sk-secret-value".into()))],
            body: json!({}),
        };
        let shown = format!("{request:?}");
        assert!(!shown.contains("sk-secret-value") && shown.contains("x-api-key"));
    }

    #[test]
    fn an_unreachable_provider_is_a_fixed_network_error() {
        // Port 9 on loopback refuses connections.
        let unreachable = config(
            ProviderKind::OpenAiCompatible,
            "http://127.0.0.1:9/v1",
            Some("m"),
        );
        let err = run(&unreachable, "sk-test-key").unwrap_err().to_string();
        assert_eq!(err, MSG_NETWORK);
        assert!(!err.contains("sk-test-key"));
    }
}
