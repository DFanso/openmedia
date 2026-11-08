//! OpenAI-compatible chat completions (OpenAI, Gemini's compatible endpoint, OpenRouter, Ollama, LM
//! Studio and the like). First asks for a strict `json_schema`; a server that rejects that gets one
//! more try in plain `json_object` mode with the schema spelled out in the system message.

use reqwest::Client;
use serde_json::{Value, json};
use zeroize::Zeroizing;

use super::{
    ProviderConfig,
    prompt::Prompt,
    provider::{ApiRequest, MSG_REFUSED, MSG_STRUCTURE, failure, model_of, send, status_error},
};
use crate::error::Result;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Mode {
    JsonSchema,
    JsonObject,
}

pub(super) fn build_request(
    base_url: &str,
    config: &ProviderConfig,
    key: &str,
    prompt: &Prompt,
    schema: &Value,
    mode: Mode,
) -> Result<ApiRequest> {
    let (system, response_format) = match mode {
        Mode::JsonSchema => (
            prompt.system.clone(),
            json!({
                "type": "json_schema",
                "json_schema": { "name": "openmedia_patch", "strict": true, "schema": schema },
            }),
        ),
        Mode::JsonObject => (
            format!(
                "{}\n\nReply with a single JSON object and nothing else (no Markdown). It must follow this JSON Schema exactly:\n{}",
                prompt.system, schema
            ),
            json!({ "type": "json_object" }),
        ),
    };
    Ok(ApiRequest {
        url: format!("{base_url}/chat/completions"),
        headers: vec![("authorization", Zeroizing::new(format!("Bearer {key}")))],
        body: json!({
            "model": model_of(config)?,
            "messages": [
                { "role": "system", "content": system },
                { "role": "user", "content": prompt.user },
            ],
            "response_format": response_format,
        }),
    })
}

/// The model's message as JSON text.
pub(super) fn parse_response(body: &Value) -> Result<String> {
    let choice = body
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .ok_or_else(|| failure(MSG_STRUCTURE))?;
    let message = choice
        .get("message")
        .ok_or_else(|| failure(MSG_STRUCTURE))?;
    let refusal = message
        .get("refusal")
        .and_then(Value::as_str)
        .is_some_and(|text| !text.is_empty());
    if refusal || choice.get("finish_reason").and_then(Value::as_str) == Some("content_filter") {
        return Err(failure(MSG_REFUSED));
    }
    if choice.get("finish_reason").and_then(Value::as_str) == Some("length") {
        return Err(failure(MSG_STRUCTURE));
    }
    let text = match message.get("content") {
        Some(Value::String(text)) => text.clone(),
        Some(Value::Array(parts)) => parts
            .iter()
            .filter_map(|part| part.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join(""),
        _ => String::new(),
    };
    if text.trim().is_empty() {
        return Err(failure(MSG_STRUCTURE));
    }
    Ok(text)
}

/// Whether a failure means "this server does not take `json_schema`", worth one more try.
pub(super) fn rejects_response_format(status: u16) -> bool {
    matches!(status, 400 | 404 | 422 | 501)
}

pub(super) async fn complete(
    client: &Client,
    base_url: &str,
    config: &ProviderConfig,
    key: &str,
    prompt: &Prompt,
    schema: &Value,
) -> Result<String> {
    let strict = build_request(base_url, config, key, prompt, schema, Mode::JsonSchema)?;
    let (status, body) = send(client, &strict).await?;
    if (200..300).contains(&status) {
        return parse_response(&body);
    }
    if !rejects_response_format(status) {
        return Err(status_error(status));
    }
    let relaxed = build_request(base_url, config, key, prompt, schema, Mode::JsonObject)?;
    let (status, body) = send(client, &relaxed).await?;
    if !(200..300).contains(&status) {
        return Err(status_error(status));
    }
    parse_response(&body)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::{
        ProviderKind,
        patch::{parse_patch, patch_schema},
        provider::{
            complete as complete_via_provider,
            test_server::{config, prompt, serve},
        },
    };

    const PATCH: &str = r#"{\"kind\":\"newOption\",\"summary\":\"Hides the stories row.\",\"optionId\":null,\"label\":\"Hide stories\",\"description\":\"The story circles.\",\"group\":\"content\",\"rules\":[{\"label\":\"Stories\",\"selector\":\"div.stories-row\"}]}"#;

    fn success() -> String {
        format!(
            r#"{{"id":"chatcmpl-1","object":"chat.completion","choices":[{{"index":0,"message":{{"role":"assistant","content":"{PATCH}","refusal":null}},"finish_reason":"stop"}}],"usage":{{"prompt_tokens":10}}}}"#
        )
    }

    fn run(base: &str, key: &str) -> Result<String> {
        let config = config(
            ProviderKind::OpenAiCompatible,
            &format!("{base}/v1"),
            Some("gpt-x"),
        );
        tauri::async_runtime::block_on(complete_via_provider(
            &config,
            key,
            &prompt(),
            &patch_schema(),
        ))
    }

    #[test]
    fn the_strict_request_has_the_schema_and_a_bearer_token() {
        let config = config(
            ProviderKind::OpenAiCompatible,
            "https://api.openai.com/v1",
            Some("gpt-x"),
        );
        let request = build_request(
            "https://api.openai.com/v1",
            &config,
            "sk-key",
            &prompt(),
            &patch_schema(),
            Mode::JsonSchema,
        )
        .unwrap();
        assert_eq!(request.url, "https://api.openai.com/v1/chat/completions");
        assert_eq!(request.headers.len(), 1);
        assert_eq!(request.headers[0].0, "authorization");
        assert_eq!(request.headers[0].1.as_str(), "Bearer sk-key");
        let body = &request.body;
        assert_eq!(body["model"], "gpt-x");
        assert_eq!(
            body["messages"][0],
            json!({ "role": "system", "content": "SYSTEM TEXT" })
        );
        assert_eq!(
            body["messages"][1],
            json!({ "role": "user", "content": "USER TEXT" })
        );
        assert_eq!(body["response_format"]["type"], "json_schema");
        assert_eq!(body["response_format"]["json_schema"]["strict"], true);
        assert_eq!(
            body["response_format"]["json_schema"]["schema"],
            patch_schema()
        );
        assert!(!body.to_string().contains("sk-key"));
    }

    #[test]
    fn the_fallback_request_spells_the_schema_out_in_the_system_message() {
        let config = config(
            ProviderKind::OpenAiCompatible,
            "http://localhost:11434/v1",
            Some("llama"),
        );
        let request = build_request(
            "http://localhost:11434/v1",
            &config,
            "k",
            &prompt(),
            &patch_schema(),
            Mode::JsonObject,
        )
        .unwrap();
        assert_eq!(
            request.body["response_format"],
            json!({ "type": "json_object" })
        );
        let system = request.body["messages"][0]["content"].as_str().unwrap();
        assert!(
            system.starts_with("SYSTEM TEXT") && system.contains("\"additionalProperties\":false")
        );
    }

    #[test]
    fn a_message_becomes_the_patch_json() {
        let body: Value = serde_json::from_str(&success()).unwrap();
        let text = parse_response(&body).unwrap();
        assert_eq!(
            parse_patch(&text, None).unwrap().summary(),
            "Hides the stories row."
        );
        let parts = json!({ "choices": [{ "message": { "content": [{ "type": "text", "text": "{\"a\":" }, { "type": "text", "text": "1}" }] }, "finish_reason": "stop" }] });
        assert_eq!(parse_response(&parts).unwrap(), "{\"a\":1}");
    }

    #[test]
    fn refusals_truncation_and_odd_shapes_are_fixed_errors() {
        let message = |body: Value| parse_response(&body).unwrap_err().to_string();
        let refusal = json!({ "choices": [{ "message": { "content": null, "refusal": "I can't help with that." }, "finish_reason": "stop" }] });
        let text = message(refusal);
        assert!(text.contains("declined") && !text.contains("can't help"));
        assert!(message(json!({ "choices": [{ "message": { "content": "" }, "finish_reason": "content_filter" }] })).contains("declined"));
        for body in [
            json!({ "choices": [{ "message": { "content": "{\"kind\":" }, "finish_reason": "length" }] }),
            json!({ "choices": [] }),
            json!({ "choices": [{ "message": { "content": "  " }, "finish_reason": "stop" }] }),
            json!({ "choices": [{ "finish_reason": "stop" }] }),
            json!({ "error": { "message": "x" } }),
            json!(null),
        ] {
            assert!(message(body).contains("not in the expected form"));
        }
    }

    #[test]
    fn it_works_end_to_end_and_never_leaks_a_provider_body() {
        let server = serve(vec![(200, success())]);
        let answer = run(&server.base, "sk-key").unwrap();
        assert!(parse_patch(&answer, None).is_ok());
        let seen = server.seen.lock().unwrap();
        assert!(
            seen[0]
                .request_line
                .starts_with("POST /v1/chat/completions ")
        );
        assert!(
            seen[0]
                .headers
                .to_lowercase()
                .contains("authorization: bearer sk-key")
        );
        assert!(seen[0].body.contains("\"json_schema\""));
        drop(seen);

        for (status, needle) in [
            (401, "rejected the key"),
            (403, "rejected the key"),
            (429, "rate limiting"),
            (500, "server error"),
            (502, "server error"),
            (503, "server error"),
        ] {
            let server = serve(vec![(
                status,
                r#"{"error":{"message":"bad key sk-key supplied"}}"#.to_owned(),
            )]);
            let text = run(&server.base, "sk-key").unwrap_err().to_string();
            assert!(text.contains(needle), "{status}: {text}");
            assert!(!text.contains("sk-key") && !text.contains("supplied"));
            assert_eq!(
                server.seen.lock().unwrap().len(),
                1,
                "no fallback for {status}"
            );
        }
    }

    #[test]
    fn a_server_that_rejects_json_schema_gets_one_json_object_retry() {
        let server = serve(vec![
            (
                400,
                r#"{"error":{"message":"response_format json_schema is not supported"}}"#
                    .to_owned(),
            ),
            (200, success()),
        ]);
        let answer = run(&server.base, "sk-key").unwrap();
        assert!(parse_patch(&answer, None).is_ok());
        let seen = server.seen.lock().unwrap();
        assert_eq!(seen.len(), 2);
        assert!(seen[0].body.contains("\"json_schema\""));
        assert!(seen[1].body.contains("\"json_object\"") && !seen[1].body.contains("\"strict\""));
    }

    #[test]
    fn the_fallback_is_tried_once_and_its_failure_is_reported() {
        let server = serve(vec![(422, "{}".to_owned()), (429, "{}".to_owned())]);
        let text = run(&server.base, "sk-key").unwrap_err().to_string();
        assert!(text.contains("rate limiting"));
        assert_eq!(server.seen.lock().unwrap().len(), 2);

        let server = serve(vec![(400, "{}".to_owned()), (400, "{}".to_owned())]);
        let text = run(&server.base, "sk-key").unwrap_err().to_string();
        assert!(text.contains("Check the model"));
    }

    #[test]
    fn malformed_content_from_a_200_is_reported_by_the_patch_validator_not_here() {
        let body = r#"{"choices":[{"message":{"content":"Sure! Here you go: {oops"},"finish_reason":"stop"}]}"#;
        let server = serve(vec![(200, body.to_owned())]);
        let answer = run(&server.base, "sk-key").unwrap();
        assert!(parse_patch(&answer, None).is_err());
    }
}
