use std::time::Duration;

use serde_json::Value;

use super::ProviderKind;
use crate::error::{Error, Result};

const ANTHROPIC_VERSION: &str = "2023-06-01";
const MAX_MODELS: usize = 200;

/// A request the app is about to make, kept as plain data so it can be checked without a network.
#[derive(Debug, Clone, PartialEq)]
pub struct RequestSpec {
    pub url: String,
    pub headers: Vec<(&'static str, String)>,
}

/// The cheapest call that proves a key works and lists the models it can use.
pub fn models_request(kind: ProviderKind, base_url: &str, key: &str) -> RequestSpec {
    match kind {
        ProviderKind::Anthropic => RequestSpec {
            url: format!("{base_url}/v1/models?limit=100"),
            headers: vec![
                ("x-api-key", key.to_owned()),
                ("anthropic-version", ANTHROPIC_VERSION.to_owned()),
            ],
        },
        ProviderKind::OpenAiCompatible => RequestSpec {
            url: format!("{base_url}/models"),
            headers: vec![("authorization", format!("Bearer {key}"))],
        },
    }
}

/// Model ids from a `/models` response (`{"data":[{"id":...}]}` for both families).
pub fn parse_models(body: &Value) -> Vec<String> {
    let mut ids: Vec<String> = body
        .get("data")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("id").and_then(Value::as_str))
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default();
    ids.sort();
    ids.dedup();
    ids.truncate(MAX_MODELS);
    ids
}

/// What the user is told for an HTTP status. Never includes the response body or any header.
pub fn describe_status(status: u16) -> String {
    match status {
        401 | 403 => "The provider rejected the key.".to_owned(),
        404 => "The provider answered, but not at that base URL.".to_owned(),
        429 => "The provider is rate limiting this key. Try again shortly.".to_owned(),
        500..=599 => "The provider reported a server error.".to_owned(),
        other => format!("The provider answered with status {other}."),
    }
}

pub async fn list_models(spec: RequestSpec) -> Result<Vec<String>> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        // A redirect could carry a custom auth header to another host.
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| Error::Connection("Could not start a secure connection.".into()))?;

    let mut request = client.get(&spec.url);
    for (name, value) in spec.headers {
        request = request.header(name, value);
    }
    let response = request
        .send()
        .await
        .map_err(|_| Error::Connection("Could not reach the provider.".into()))?;

    let status = response.status();
    if !status.is_success() {
        return Err(Error::Connection(describe_status(status.as_u16())));
    }
    let body: Value = response
        .json()
        .await
        .map_err(|_| Error::Connection("The provider's answer was not understood.".into()))?;
    Ok(parse_models(&body))
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn anthropic_uses_its_own_headers_and_never_puts_the_key_in_the_url() {
        let spec = models_request(
            ProviderKind::Anthropic,
            "https://api.anthropic.com",
            "sk-secret",
        );
        assert_eq!(spec.url, "https://api.anthropic.com/v1/models?limit=100");
        assert!(!spec.url.contains("sk-secret"));
        assert!(spec.headers.contains(&("x-api-key", "sk-secret".into())));
        assert!(
            spec.headers
                .contains(&("anthropic-version", ANTHROPIC_VERSION.into()))
        );
    }

    #[test]
    fn openai_compatible_uses_a_bearer_token() {
        let spec = models_request(
            ProviderKind::OpenAiCompatible,
            "https://api.openai.com/v1",
            "sk-secret",
        );
        assert_eq!(spec.url, "https://api.openai.com/v1/models");
        assert_eq!(
            spec.headers,
            vec![("authorization", "Bearer sk-secret".to_string())]
        );
    }

    #[test]
    fn model_ids_are_sorted_deduplicated_and_tolerate_odd_bodies() {
        let body = json!({"data":[{"id":"b"},{"id":"a"},{"id":"a"},{"nope":1}]});
        assert_eq!(parse_models(&body), ["a", "b"]);
        assert!(parse_models(&json!({"error":"x"})).is_empty());
        assert!(parse_models(&json!(null)).is_empty());
    }

    #[test]
    fn status_messages_never_echo_the_provider() {
        assert!(describe_status(401).contains("rejected the key"));
        assert!(describe_status(429).contains("rate limiting"));
        assert!(describe_status(503).contains("server error"));
        for status in [200, 401, 404, 418, 500] {
            assert!(!describe_status(status).to_lowercase().contains("bearer"));
        }
    }
}
