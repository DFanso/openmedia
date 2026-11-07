use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// A WebKit content rule list, compiled on demand. `id` names it in WebKit's persistent store, so
/// the JSON file at `path` is only read when the store does not already hold `id`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ContentRuleList {
    pub id: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenRequest {
    pub profile: String,
    pub url: String,
    pub rect: Rect,
    #[serde(default)]
    pub document_start_script: Option<String>,
    #[serde(default)]
    pub content_rule_lists: Vec<ContentRuleList>,
}

/// Replaces the rule lists on the open site view and reloads it. An empty list turns blocking off.
#[derive(Debug, Clone, Deserialize)]
pub struct SetContentRuleListsRequest {
    pub lists: Vec<ContentRuleList>,
}

/// Replaces the script injected at document start and reloads the open site view, so the page
/// loads under the new script. An empty script removes it.
#[derive(Debug, Clone, Deserialize)]
pub struct SetDocumentStartScriptRequest {
    pub script: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SetRectRequest {
    pub rect: Rect,
}

/// Rectangles, in shell CSS pixels, where touches belong to the shell. Everywhere else a touch
/// goes to the site view underneath.
#[derive(Debug, Clone, Deserialize)]
pub struct SetInteractiveRegionsRequest {
    pub regions: Vec<Rect>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NavigateRequest {
    pub url: String,
}

/// Events the native side sends to Core. Everything here is data from a hostile page or
/// derived from it; only [`SiteViewEvent::State`] fields are produced by the native layer itself.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum SiteViewEvent {
    State {
        url: Option<String>,
        title: Option<String>,
        loading: bool,
        can_go_back: bool,
        can_go_forward: bool,
    },
    Error {
        message: String,
    },
    Bridge {
        origin: String,
        body: String,
    },
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct BridgeMessage {
    pub origin: String,
    pub body: serde_json::Value,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ColorScheme {
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SetColorSchemeRequest {
    pub scheme: ColorScheme,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FetchFaviconRequest {
    pub url: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FaviconResponse {
    pub data_url: Option<String>,
}
