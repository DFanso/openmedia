//! Fetches a newer bundle from the release the CLI publishes to. HTTPS only, every body
//! size-capped, and the bundle's own signature is what is trusted, not the server or the path.
//! The file name is derived from the pointer's revision, never taken from it as a URL.

use std::time::Duration;

use reqwest::{Client, Response, StatusCode, redirect::Policy};
use serde::{Deserialize, Serialize};

use super::{
    Running,
    bundle::{self, MAX_PACKED_BYTES},
};
use crate::error::{Error, Result};

const REPO: &str = env!("CARGO_PKG_REPOSITORY");
/// A rolling pre-release: it never becomes the repository's "latest release", which is the
/// desktop updater's.
const RELEASE_TAG: &str = "ota";
const MAX_POINTER_BYTES: usize = 4 * 1024;
const MAX_REDIRECTS: usize = 5;
const TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Pointer {
    runtime_version: String,
    revision: u64,
    size: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Outcome {
    UpToDate,
    Staged { revision: u64 },
}

fn asset_url(name: &str) -> String {
    format!("{REPO}/releases/download/{RELEASE_TAG}/{name}")
}

fn http() -> Result<Client> {
    Client::builder()
        .https_only(true)
        .timeout(TIMEOUT)
        .redirect(Policy::custom(|attempt| {
            if attempt.previous().len() < MAX_REDIRECTS && attempt.url().scheme() == "https" {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .build()
        .map_err(|_| unreachable_server())
}

fn unreachable_server() -> Error {
    Error::Connection("Could not reach the update server.".into())
}

async fn get(http: &Client, name: &str, limit: usize) -> Result<Option<Vec<u8>>> {
    let mut response = http
        .get(asset_url(name))
        .send()
        .await
        .map_err(|_| unreachable_server())?;
    if response.status() == StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !response.status().is_success() {
        return Err(unreachable_server());
    }
    read_capped(&mut response, limit).await.map(Some)
}

async fn read_capped(response: &mut Response, limit: usize) -> Result<Vec<u8>> {
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| unreachable_server())? {
        if body.len() + chunk.len() > limit {
            return Err(Error::Ota("the update is too large".into()));
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

/// Downloads, verifies and stages the newest bundle for this runtime, if it is newer than any the
/// device holds. A release with no pointer for this runtime means no update.
pub async fn check(running: &Running) -> Result<Outcome> {
    let key = running
        .key
        .ok_or_else(|| Error::Ota("this build cannot verify updates".into()))?;
    let http = http()?;
    let pointer_name = format!("latest-{}.json", running.runtime);
    let Some(pointer) = get(&http, &pointer_name, MAX_POINTER_BYTES).await? else {
        return Ok(Outcome::UpToDate);
    };
    let pointer: Pointer = serde_json::from_slice(&pointer)
        .map_err(|_| Error::Ota("the update is malformed".into()))?;
    if pointer.runtime_version != running.runtime || pointer.revision <= running.store.newest() {
        return Ok(Outcome::UpToDate);
    }
    if pointer.size as usize > MAX_PACKED_BYTES {
        return Err(Error::Ota("the update is too large".into()));
    }
    let bundle_name = format!("bundle-{}-{}.ota", running.runtime, pointer.revision);
    let packed = get(&http, &bundle_name, MAX_PACKED_BYTES)
        .await?
        .ok_or_else(unreachable_server)?;
    let opened = bundle::open(&packed, &key, &running.runtime)?;
    if opened.revision != pointer.revision {
        return Err(Error::Ota(
            "the update is not the revision it claims".into(),
        ));
    }
    running.store.stage(pointer.revision, &packed)?;
    Ok(Outcome::Staged {
        revision: pointer.revision,
    })
}
