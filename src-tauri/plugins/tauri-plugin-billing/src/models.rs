use serde::{Deserialize, Serialize};

use crate::{Error, Result};

/// What the store says about the entitlement right now.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub active: bool,
    pub product_id: Option<String>,
    pub in_trial: bool,
    pub expires_at_ms: Option<i64>,
    pub will_renew: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PackageKind {
    Monthly,
    Yearly,
    Lifetime,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Package {
    pub id: String,
    pub kind: PackageKind,
    pub product_id: String,
    /// Already localized by the store; never build prices in the UI.
    pub price: String,
    pub trial_days: Option<u32>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "outcome", rename_all = "camelCase")]
pub enum PurchaseOutcome {
    Purchased { snapshot: Snapshot },
    Cancelled,
    Pending,
}

/// What the store sends back from a purchase. The snapshot is optional there: a store that
/// answers without it still means the purchase went through.
#[derive(Debug, Deserialize)]
#[serde(tag = "outcome", rename_all = "camelCase")]
pub enum PurchaseWire {
    Purchased { snapshot: Option<Snapshot> },
    Cancelled,
    Pending,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ConfigureRequest {
    pub api_key: String,
    pub entitlement_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum BillingEvent {
    Snapshot(Snapshot),
}

#[derive(Debug, Deserialize)]
pub struct OfferingsResponse {
    pub packages: Vec<Package>,
}

pub const PACKAGE_IDS: [&str; 3] = ["$rc_lifetime", "$rc_annual", "$rc_monthly"];

pub fn validate_package_id(id: &str) -> Result<&str> {
    if PACKAGE_IDS.contains(&id) {
        Ok(id)
    } else {
        Err(Error::InvalidPackage)
    }
}
