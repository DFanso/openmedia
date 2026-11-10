//! The only code that talks to the marketplace. It is built to distrust the server: HTTPS only,
//! no redirects, no cookies, every response size-capped, and errors that never repeat what the
//! server said. What it returns is checked by `index` before anything uses it.

use std::{collections::BTreeMap, net::IpAddr, time::Duration};

use reqwest::{Client, Response, StatusCode, redirect::Policy};
use serde::{Deserialize, Serialize};
use url::{Host, Url};

use super::index::{Entry, Index, MAX_INDEX_BYTES, TrustedKey, verify};
use crate::error::{Error, Result};
use crate::recipes::{self, Recipe};

const MARKET_URL: Option<&str> = option_env!("OPENMEDIA_MARKET_URL");
const CATALOG_KEYS: Option<&str> = option_env!("OPENMEDIA_CATALOG_KEYS");
const MAX_SIGNATURE_BYTES: usize = 1024;
const MAX_STATS_BYTES: usize = 256 * 1024;
const MAX_REPLY_BYTES: usize = 4 * 1024;
const TIMEOUT: Duration = Duration::from_secs(15);

pub struct Market {
    base: Url,
    keys: Vec<TrustedKey>,
    http: Client,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ReportReason {
    Harmful,
    Broken,
    Misleading,
    Spam,
    Other,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Submitted {
    pub submission_id: String,
    pub edit_token: Option<String>,
}

impl Market {
    /// The marketplace this build was configured for, or `MarketplaceNotConfigured`.
    pub fn from_build() -> Result<Self> {
        match (MARKET_URL, CATALOG_KEYS) {
            (Some(url), Some(keys)) if !url.is_empty() && !keys.is_empty() => Self::new(url, keys),
            _ => Err(Error::MarketplaceNotConfigured),
        }
    }

    pub fn new(base: &str, keys: &str) -> Result<Self> {
        let base = checked_base(base)?;
        let keys = TrustedKey::parse_list(keys)?;
        if keys.is_empty() {
            return Err(Error::MarketplaceNotConfigured);
        }
        let http = Client::builder()
            .timeout(TIMEOUT)
            // A redirect could send a request, or what it carries, to another host.
            .redirect(Policy::none())
            .https_only(!is_loopback(&base))
            .user_agent("OpenMedia")
            .build()
            .map_err(|_| Error::Catalog("could not set up the connection".into()))?;
        Ok(Self { base, keys, http })
    }

    /// The signed catalog, verified against the build's keys.
    pub async fn fetch_index(&self, now: i64, last_sequence: u64) -> Result<Index> {
        let bytes = self.get("v1/index.json", MAX_INDEX_BYTES).await?;
        let signature = self.get("v1/index.json.sig", MAX_SIGNATURE_BYTES).await?;
        let signature = String::from_utf8(signature)
            .map_err(|_| Error::Catalog("the catalog signature is malformed".into()))?;
        verify(&bytes, &signature, &self.keys, now, last_sequence)
    }

    /// The exact bytes of a recipe file; the caller ties them to the index.
    pub async fn fetch_recipe(&self, entry: &Entry) -> Result<Vec<u8>> {
        let path = recipe_path(&entry.id, &entry.version)?;
        let max = usize::try_from(entry.size).unwrap_or(recipes::MAX_RECIPE_BYTES);
        self.get(&path, max).await
    }

    /// Install counts. Unsigned and display-only, so a failure or a strange answer is just "none".
    pub async fn fetch_stats(&self) -> BTreeMap<String, u64> {
        self.get("v1/stats.json", MAX_STATS_BYTES)
            .await
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default()
    }

    /// Counts one install. Carries no body and no identifier.
    pub async fn report_install(&self, id: &str) -> Result<()> {
        if !recipes::is_catalog_id(id) {
            return Err(Error::Catalog("not a marketplace id".into()));
        }
        self.post(&format!("v1/recipes/{id}/installs"), None)
            .await
            .map(drop)
    }

    pub async fn submit(
        &self,
        recipe: &Recipe,
        summary: &str,
        edit_token: Option<&str>,
    ) -> Result<Submitted> {
        let mut body = serde_json::json!({ "recipe": recipe, "summary": summary });
        if let (Some(token), Some(object)) = (edit_token, body.as_object_mut()) {
            object.insert("editToken".into(), token.into());
        }
        let reply = self
            .post("v1/submissions", Some(serde_json::to_vec(&body)?))
            .await?;
        serde_json::from_slice(&reply)
            .map_err(|_| Error::Catalog("the marketplace answered unexpectedly".into()))
    }

    pub async fn report(&self, id: &str, version: &str, reason: ReportReason) -> Result<()> {
        recipe_path(id, version)?;
        let body = serde_json::json!({ "id": id, "version": version, "reason": reason });
        self.post("v1/reports", Some(serde_json::to_vec(&body)?))
            .await
            .map(drop)
    }

    async fn get(&self, path: &str, max: usize) -> Result<Vec<u8>> {
        let response = self
            .http
            .get(self.endpoint(path)?)
            .send()
            .await
            .map_err(unreachable)?;
        read_capped(check_status(response)?, max).await
    }

    async fn post(&self, path: &str, body: Option<Vec<u8>>) -> Result<Vec<u8>> {
        let mut request = self.http.post(self.endpoint(path)?);
        if let Some(body) = body {
            request = request
                .header("content-type", "application/json")
                .body(body);
        }
        let response = request.send().await.map_err(unreachable)?;
        read_capped(check_status(response)?, MAX_REPLY_BYTES).await
    }

    fn endpoint(&self, path: &str) -> Result<Url> {
        self.base
            .join(path)
            .map_err(|_| Error::Catalog("bad marketplace address".into()))
    }
}

/// The path of a recipe file. Both parts are checked, so nothing else can reach the URL.
fn recipe_path(id: &str, version: &str) -> Result<String> {
    if recipes::is_catalog_id(id) && recipes::is_version(version) {
        Ok(format!("v1/recipes/{id}/{version}.json"))
    } else {
        Err(Error::Catalog("not a marketplace recipe".into()))
    }
}

/// HTTPS, a host, nothing else in the address. Plain HTTP only to this machine, and only in a
/// debug build, so a local `wrangler dev` can be tried.
fn checked_base(text: &str) -> Result<Url> {
    let url = Url::parse(text).map_err(|_| Error::Catalog("bad marketplace address".into()))?;
    let plain_ok = cfg!(debug_assertions) && url.scheme() == "http" && is_loopback(&url);
    let clean = url.host().is_some()
        && url.username().is_empty()
        && url.password().is_none()
        && url.query().is_none()
        && url.fragment().is_none()
        && url.path() == "/";
    if clean && (url.scheme() == "https" || plain_ok) {
        Ok(url)
    } else {
        Err(Error::Catalog("bad marketplace address".into()))
    }
}

fn is_loopback(url: &Url) -> bool {
    match url.host() {
        Some(Host::Domain(domain)) => domain == "localhost",
        Some(Host::Ipv4(address)) => IpAddr::V4(address).is_loopback(),
        Some(Host::Ipv6(address)) => IpAddr::V6(address).is_loopback(),
        None => false,
    }
}

fn check_status(response: Response) -> Result<Response> {
    let status = response.status();
    if status.is_success() {
        return Ok(response);
    }
    Err(Error::Catalog(if status == StatusCode::TOO_MANY_REQUESTS {
        "too many requests; try again in a minute".into()
    } else {
        format!("the marketplace answered {}", status.as_u16())
    }))
}

async fn read_capped(mut response: Response, max: usize) -> Result<Vec<u8>> {
    let too_large = || Error::Catalog("the marketplace sent too much data".into());
    if response
        .content_length()
        .is_some_and(|length| length > max as u64)
    {
        return Err(too_large());
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(unreachable)? {
        if body.len() + chunk.len() > max {
            return Err(too_large());
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

fn unreachable(_: reqwest::Error) -> Error {
    Error::Catalog("could not reach the marketplace".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY: &str = "k1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

    #[test]
    fn only_a_bare_https_address_is_accepted() {
        assert!(Market::new("https://market.openmedia.surf", KEY).is_ok());
        for bad in [
            "http://market.openmedia.surf",
            "https://user:pw@market.openmedia.surf",
            "https://market.openmedia.surf/v1",
            "https://market.openmedia.surf/?x=1",
            "https://market.openmedia.surf/#x",
            "ftp://market.openmedia.surf",
            "market.openmedia.surf",
        ] {
            assert!(Market::new(bad, KEY).is_err(), "{bad}");
        }
    }

    #[test]
    fn plain_http_is_for_this_machine_only() {
        assert!(Market::new("http://127.0.0.1:8787", KEY).is_ok());
        assert!(Market::new("http://localhost:8787", KEY).is_ok());
        assert!(Market::new("http://192.168.1.5:8787", KEY).is_err());
    }

    #[test]
    fn a_build_without_keys_is_not_configured() {
        assert!(matches!(
            Market::new("https://market.openmedia.surf", ""),
            Err(Error::MarketplaceNotConfigured)
        ));
    }

    #[test]
    fn recipe_paths_only_take_well_formed_ids_and_versions() {
        assert_eq!(
            recipe_path("market.calm", "1.0.0").unwrap(),
            "v1/recipes/market.calm/1.0.0.json"
        );
        for (id, version) in [
            ("market.calm/../x", "1.0.0"),
            ("calm", "1.0.0"),
            ("market.calm", "1.0.0/../../x"),
            ("market.calm", "latest"),
        ] {
            assert!(recipe_path(id, version).is_err(), "{id} {version}");
        }
    }
}
