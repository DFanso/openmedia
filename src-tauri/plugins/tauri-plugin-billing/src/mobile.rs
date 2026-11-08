use serde::de::DeserializeOwned;
use tauri::{
    AppHandle, Emitter, Runtime,
    ipc::{Channel, InvokeResponseBody},
    plugin::{PluginApi, PluginHandle},
};

use crate::models::*;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SimulatorResponse {
    is_simulator: bool,
}
use crate::{Error, Result, SNAPSHOT_EVENT};

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_billing);

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> Result<Billing<R>> {
    #[cfg(target_os = "ios")]
    let handle = api.register_ios_plugin(init_plugin_billing)?;
    #[cfg(target_os = "android")]
    let handle = api.register_android_plugin("surf.openmedia.billing", "BillingPlugin")?;

    let app = app.clone();
    let events = Channel::new(move |body| {
        if let InvokeResponseBody::Json(json) = body {
            dispatch_event(&app, &json);
        }
        Ok(())
    });
    Ok(Billing { handle, events })
}

fn dispatch_event<R: Runtime>(app: &AppHandle<R>, json: &str) {
    let Ok(event) = serde_json::from_str::<BillingEvent>(json) else {
        return;
    };
    let _ = match event {
        BillingEvent::Snapshot(snapshot) => app.emit(SNAPSHOT_EVENT, snapshot),
    };
}

pub struct Billing<R: Runtime> {
    handle: PluginHandle<R>,
    events: Channel<serde_json::Value>,
}

impl<R: Runtime> Billing<R> {
    fn run<T: DeserializeOwned>(&self, command: &str, payload: impl serde::Serialize) -> Result<T> {
        self.handle
            .run_mobile_plugin(command, payload)
            .map_err(Error::from)
    }

    /// Hands the public SDK key to RevenueCat and starts the stream of entitlement changes.
    pub fn configure(&self, request: ConfigureRequest) -> Result<()> {
        self.run(
            "configure",
            serde_json::json!({
                "apiKey": request.api_key,
                "entitlementId": request.entitlement_id,
                "onEvent": &self.events,
            }),
        )
    }

    pub fn customer_info(&self) -> Result<Snapshot> {
        self.run("customerInfo", ())
    }

    pub fn offerings(&self) -> Result<Vec<Package>> {
        let response: OfferingsResponse = self.run("offerings", ())?;
        Ok(response.packages)
    }

    pub fn purchase(&self, package_id: &str) -> Result<PurchaseOutcome> {
        let package_id = validate_package_id(package_id)?;
        let outcome: PurchaseWire =
            self.run("purchase", serde_json::json!({ "packageId": package_id }))?;
        Ok(match outcome {
            PurchaseWire::Purchased { snapshot } => PurchaseOutcome::Purchased {
                snapshot: match snapshot {
                    Some(snapshot) => snapshot,
                    None => self.customer_info()?,
                },
            },
            PurchaseWire::Cancelled => PurchaseOutcome::Cancelled,
            PurchaseWire::Pending => PurchaseOutcome::Pending,
        })
    }

    pub fn restore(&self) -> Result<Snapshot> {
        self.run("restore", ())
    }

    /// Reports the native runtime type without exposing a new Tauri command.
    pub fn is_simulator(&self) -> Result<bool> {
        let response: SimulatorResponse = self.run("isSimulator", ())?;
        Ok(response.is_simulator)
    }
}
