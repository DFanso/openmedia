//! Anthropic Messages API with forced tool use: the patch schema is the tool's input schema and the
//! model must call that tool, so the answer is structured by the API and still validated by us.

use reqwest::Client;
use serde_json::{Value, json};
use zeroize::Zeroizing;

use super::{
    ProviderConfig,
    prompt::Prompt,
    provider::{ApiRequest, MSG_REFUSED, MSG_STRUCTURE, failure, model_of, send, status_error},
};
use crate::error::Result;

const ANTHROPIC_VERSION: &str = "2023-06-01";
const TOOL_NAME: &str = "propose_patch";
const MAX_OUTPUT_TOKENS: u32 = 2048;

pub(super) fn build_request(
    base_url: &str,
    config: &ProviderConfig,
    key: &str,
    prompt: &Prompt,
    schema: &Value,
) -> Result<ApiRequest> {
    Ok(ApiRequest {
        url: format!("{base_url}/v1/messages"),
        headers: vec![
            ("x-api-key", Zeroizing::new(key.to_owned())),
            (
                "anthropic-version",
                Zeroizing::new(ANTHROPIC_VERSION.to_owned()),
            ),
        ],
        body: json!({
            "model": model_of(config)?,
            "max_tokens": MAX_OUTPUT_TOKENS,
            "temperature": 0,
            "system": prompt.system,
            "messages": [{ "role": "user", "content": prompt.user }],
            "tools": [{
                "name": TOOL_NAME,
                "description": "Propose the switch (option) and its hide rules for the user's request.",
                "input_schema": schema,
            }],
            "tool_choice": { "type": "tool", "name": TOOL_NAME },
        }),
    })
}

/// The tool call's input as JSON text, or a fixed error for a refusal or any other shape.
pub(super) fn parse_response(body: &Value) -> Result<String> {
    let stop = body.get("stop_reason").and_then(Value::as_str);
    if stop == Some("refusal") {
        return Err(failure(MSG_REFUSED));
    }
    let call = body
        .get("content")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .find(|block| {
            block.get("type").and_then(Value::as_str) == Some("tool_use")
                && block.get("name").and_then(Value::as_str) == Some(TOOL_NAME)
        });
    match call
        .and_then(|block| block.get("input"))
        .filter(|input| input.is_object())
    {
        Some(input) if stop != Some("max_tokens") => {
            serde_json::to_string(input).map_err(|_| failure(MSG_STRUCTURE))
        }
        _ => Err(failure(MSG_STRUCTURE)),
    }
}

pub(super) async fn complete(
    client: &Client,
    base_url: &str,
    config: &ProviderConfig,
    key: &str,
    prompt: &Prompt,
    schema: &Value,
) -> Result<String> {
    let request = build_request(base_url, config, key, prompt, schema)?;
    let (status, body) = send(client, &request).await?;
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
        patch::patch_schema,
        provider::{
            complete as complete_via_provider,
            test_server::{config, prompt, serve},
        },
    };
    use crate::error::Error;

    const SUCCESS: &str = r#"{"id":"msg_01","type":"message","role":"assistant","model":"claude-x",
      "content":[{"type":"text","text":"Calling the tool."},
                 {"type":"tool_use","id":"toolu_01","name":"propose_patch",
                  "input":{"kind":"newOption","summary":"Hides the stories row.","optionId":null,
                           "label":"Hide stories","description":"The story circles.","group":"content",
                           "rules":[{"label":"Stories","selector":"div.stories-row"}]}}],
      "stop_reason":"tool_use","usage":{"input_tokens":10,"output_tokens":5}}"#;

    fn run(base: &str, key: &str) -> Result<String> {
        let config = config(ProviderKind::Anthropic, base, Some("claude-x"));
        tauri::async_runtime::block_on(complete_via_provider(
            &config,
            key,
            &prompt(),
            &patch_schema(),
        ))
    }

    #[test]
    fn the_request_forces_the_patch_tool_and_carries_both_messages() {
        let config = config(
            ProviderKind::Anthropic,
            "https://api.anthropic.com",
            Some("claude-x"),
        );
        let request = build_request(
            "https://api.anthropic.com",
            &config,
            "sk-ant-key",
            &prompt(),
            &patch_schema(),
        )
        .unwrap();
        assert_eq!(request.url, "https://api.anthropic.com/v1/messages");
        let header = |name: &str| {
            request
                .headers
                .iter()
                .find(|(n, _)| *n == name)
                .map(|(_, v)| v.as_str().to_owned())
        };
        assert_eq!(header("x-api-key").as_deref(), Some("sk-ant-key"));
        assert_eq!(header("anthropic-version").as_deref(), Some("2023-06-01"));
        assert!(!request.url.contains("sk-ant-key"));
        let body = &request.body;
        assert_eq!(body["model"], "claude-x");
        assert_eq!(body["system"], "SYSTEM TEXT");
        assert_eq!(
            body["messages"],
            json!([{ "role": "user", "content": "USER TEXT" }])
        );
        assert_eq!(
            body["tool_choice"],
            json!({ "type": "tool", "name": "propose_patch" })
        );
        assert_eq!(body["tools"][0]["name"], "propose_patch");
        assert_eq!(body["tools"][0]["input_schema"], patch_schema());
        assert!(!body.to_string().contains("sk-ant-key"));
    }

    #[test]
    fn a_tool_call_becomes_the_patch_json() {
        let answer = parse_response(&serde_json::from_str(SUCCESS).unwrap()).unwrap();
        let patch = crate::ai::patch::parse_patch(&answer, None).unwrap();
        assert_eq!(patch.summary(), "Hides the stories row.");
    }

    #[test]
    fn refusals_and_odd_shapes_are_fixed_errors() {
        let message = |body: Value| parse_response(&body).unwrap_err().to_string();
        assert!(message(json!({ "stop_reason": "refusal", "content": [] })).contains("declined"));
        for body in [
            json!({ "content": [{ "type": "text", "text": "I would rather not." }], "stop_reason": "end_turn" }),
            json!({ "content": [{ "type": "tool_use", "name": "other", "input": {} }] }),
            json!({ "content": [{ "type": "tool_use", "name": "propose_patch", "input": "str" }] }),
            json!({ "content": [{ "type": "tool_use", "name": "propose_patch", "input": {"kind":"newOption"} }], "stop_reason": "max_tokens" }),
            json!({ "content": "nope" }),
            json!(null),
        ] {
            assert!(message(body).contains("not in the expected form"));
        }
    }

    #[test]
    fn it_talks_to_a_server_end_to_end_and_maps_vendor_errors() {
        let server = serve(vec![(200, SUCCESS.to_owned())]);
        let answer = run(&server.base, "sk-ant-key").unwrap();
        assert!(answer.contains("Hide stories"));
        let seen = server.seen.lock().unwrap();
        assert!(seen[0].request_line.starts_with("POST /v1/messages "));
        assert!(
            seen[0]
                .headers
                .to_lowercase()
                .contains("x-api-key: sk-ant-key")
        );
        assert!(seen[0].body.contains("\"tool_choice\""));
        drop(seen);

        for (status, needle) in [
            (401, "rejected the key"),
            (403, "rejected the key"),
            (429, "rate limiting"),
            (500, "server error"),
            (529, "overloaded"),
            (400, "Check the model"),
        ] {
            let body = r#"{"type":"error","error":{"type":"x","message":"sk-ant-key leaked in provider text"}}"#;
            let server = serve(vec![(status, body.to_owned())]);
            let err = run(&server.base, "sk-ant-key").unwrap_err();
            let text = err.to_string();
            assert!(text.contains(needle), "{status}: {text}");
            assert!(!text.contains("leaked") && !text.contains("sk-ant-key"));
            assert!(matches!(err, Error::Connection(_)));
        }
    }

    #[test]
    fn a_non_json_success_body_is_an_invalid_structure_not_a_leak() {
        let server = serve(vec![(200, "<html>sk-ant-key</html>".to_owned())]);
        let text = run(&server.base, "sk-ant-key").unwrap_err().to_string();
        assert!(text.contains("not in the expected form") && !text.contains("html"));
    }
}
