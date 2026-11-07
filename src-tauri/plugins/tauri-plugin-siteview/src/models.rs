use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenRequest {
    pub profile: String,
    pub url: String,
    pub rect: Rect,
    #[serde(default)]
    pub document_start_script: Option<String>,
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
