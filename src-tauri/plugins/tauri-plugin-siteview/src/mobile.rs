use serde::de::DeserializeOwned;
use tauri::{
    AppHandle, Emitter, Runtime,
    ipc::{Channel, InvokeResponseBody},
    plugin::{PluginApi, PluginHandle},
};

use crate::models::*;
use crate::validate::{
    check_evaluate_result, parse_bridge_body, parse_session_id, wrap_evaluate_script,
};
use crate::{Error, Result};

pub const STATE_EVENT: &str = "siteview:state";
pub const ERROR_EVENT: &str = "siteview:error";
pub const BRIDGE_EVENT: &str = "siteview:bridge";
pub const CLOSED_EVENT: &str = "siteview:closed";
pub const MEMORY_EVENT: &str = "siteview:memory";
pub const NOTIFICATION_TAP_EVENT: &str = "siteview:notification-tap";

#[cfg(target_os = "android")]
compile_error!("the Android site view is not implemented yet; see docs/wiki/platform-support.md");

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_siteview);

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> Result<Siteview<R>> {
    let handle = api.register_ios_plugin(init_plugin_siteview)?;

    let app = app.clone();
    let events = Channel::new(move |body| {
        if let InvokeResponseBody::Json(json) = body {
            dispatch_event(&app, &json);
        }
        Ok(())
    });
    Ok(Siteview { handle, events })
}

fn dispatch_event<R: Runtime>(app: &AppHandle<R>, json: &str) {
    let Ok(event) = serde_json::from_str::<SiteViewEvent>(json) else {
        return;
    };
    let _ = match event {
        SiteViewEvent::State { .. } => app.emit(STATE_EVENT, event),
        SiteViewEvent::Closed { session } => app.emit(CLOSED_EVENT, session),
        SiteViewEvent::MemoryWarning => app.emit(MEMORY_EVENT, ()),
        SiteViewEvent::NotificationTapped { session } => {
            match parse_session_id(&session) {
                Ok(_) => app.emit(NOTIFICATION_TAP_EVENT, session),
                Err(_) => Ok(()),
            }
        }
        SiteViewEvent::Error { message } => app.emit(ERROR_EVENT, message),
        SiteViewEvent::Bridge { origin, body } => match parse_bridge_body(&body) {
            Ok(body) => app.emit(BRIDGE_EVENT, BridgeMessage { origin, body }),
            Err(_) => Ok(()),
        },
    };
}

pub struct Siteview<R: Runtime> {
    handle: PluginHandle<R>,
    events: Channel<serde_json::Value>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenPayload<'a> {
    #[serde(flatten)]
    request: &'a OpenRequest,
    on_event: &'a Channel<serde_json::Value>,
}

impl<R: Runtime> Siteview<R> {
    fn run<T: DeserializeOwned>(&self, command: &str, payload: impl serde::Serialize) -> Result<T> {
        self.handle
            .run_mobile_plugin(command, payload)
            .map_err(Error::from)
    }

    pub fn open(&self, request: OpenRequest) -> Result<()> {
        self.run(
            "open",
            OpenPayload {
                request: &request,
                on_event: &self.events,
            },
        )
    }

    pub fn activate(&self, request: SessionRequest) -> Result<()> {
        self.run(
            "activate",
            serde_json::json!({ "session": request.session }),
        )
    }

    pub fn close(&self, request: SessionRequest) -> Result<()> {
        self.run("close", serde_json::json!({ "session": request.session }))
    }

    pub fn set_rect(&self, request: SetRectRequest) -> Result<()> {
        self.run("setRect", serde_json::json!({ "rect": request.rect }))
    }

    pub fn set_interactive_regions(&self, request: SetInteractiveRegionsRequest) -> Result<()> {
        self.run(
            "setInteractiveRegions",
            serde_json::json!({ "regions": request.regions }),
        )
    }

    pub fn navigate(&self, request: NavigateRequest) -> Result<()> {
        self.run("navigate", serde_json::json!({ "url": request.url }))
    }

    pub fn go_back(&self) -> Result<()> {
        self.run("goBack", ())
    }

    pub fn go_forward(&self) -> Result<()> {
        self.run("goForward", ())
    }

    pub fn reload(&self) -> Result<()> {
        self.run("reload", ())
    }

    pub fn notify(&self, request: NotifyRequest) -> Result<()> {
        self.run(
            "notify",
            serde_json::json!({
                "session": request.session,
                "title": request.title,
                "body": request.body,
            }),
        )
    }
}

impl<R: Runtime> Siteview<R> {
    pub fn set_color_scheme(&self, request: SetColorSchemeRequest) -> Result<()> {
        self.run(
            "setColorScheme",
            serde_json::json!({ "scheme": request.scheme }),
        )
    }

    pub fn fetch_favicon(&self, request: FetchFaviconRequest) -> Result<Option<String>> {
        let response: FaviconResponse =
            self.run("fetchFavicon", serde_json::json!({ "url": request.url }))?;
        Ok(response.data_url)
    }

    pub fn set_document_start_script(&self, request: SetDocumentStartScriptRequest) -> Result<()> {
        self.run(
            "setDocumentStartScript",
            serde_json::json!({ "script": request.script }),
        )
    }

    pub fn set_content_rule_lists(&self, request: SetContentRuleListsRequest) -> Result<()> {
        self.run(
            "setContentRuleLists",
            serde_json::json!({ "lists": request.lists }),
        )
    }

    /// Covers one session with a native shield and stops it: no touches, no loading, no media,
    /// no navigation. Rust-only: the plugin registers no command for it, so neither the shell
    /// nor a site view can reach it.
    pub fn set_blocked(&self, request: SetBlockedRequest) -> Result<()> {
        self.run(
            "setBlocked",
            serde_json::json!({ "session": request.session, "blocked": request.blocked }),
        )
    }

    /// Evaluates `request.script` (an expression) in the active session's main frame and returns
    /// its value as JSON text. Rust-only: it is deliberately not a Tauri command and has no
    /// permission, so no webview can call it. The result is hostile page data.
    pub fn evaluate(&self, request: EvaluateRequest) -> Result<String> {
        let script = wrap_evaluate_script(&request.script)?;
        let response: EvaluateResponse =
            self.run("evaluate", serde_json::json!({ "script": script }))?;
        check_evaluate_result(response.json)
    }
}
