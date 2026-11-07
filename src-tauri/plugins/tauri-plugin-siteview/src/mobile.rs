use serde::de::DeserializeOwned;
use tauri::{
    AppHandle, Emitter, Runtime,
    ipc::{Channel, InvokeResponseBody},
    plugin::{PluginApi, PluginHandle},
};

use crate::models::*;
use crate::validate::parse_bridge_body;
use crate::{Error, Result};

pub const STATE_EVENT: &str = "siteview:state";
pub const ERROR_EVENT: &str = "siteview:error";
pub const BRIDGE_EVENT: &str = "siteview:bridge";

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_siteview);

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> Result<Siteview<R>> {
    #[cfg(target_os = "android")]
    let handle = api.register_android_plugin("dev.openmedia.siteview", "SiteViewPlugin")?;
    #[cfg(target_os = "ios")]
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

    pub fn close(&self) -> Result<()> {
        self.run("close", ())
    }

    pub fn set_rect(&self, request: SetRectRequest) -> Result<()> {
        self.run("setRect", serde_json::json!({ "rect": request.rect }))
    }

    pub fn set_visible(&self, request: SetVisibleRequest) -> Result<()> {
        self.run(
            "setVisible",
            serde_json::json!({ "visible": request.visible }),
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

    pub fn delete_profile_data(&self, request: DeleteProfileDataRequest) -> Result<()> {
        self.run(
            "deleteProfileData",
            serde_json::json!({ "profile": request.profile }),
        )
    }
}
