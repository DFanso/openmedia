//! The commands behind the daily site limits: the policies the user set, and the native block
//! that closes a site for the day.
//!
//! These are app commands, not plugin commands, so no capability reaches them from a site view.
//! The plugin's own block method is Rust-only: the plugin registers no command for it, so the
//! shell cannot call it either. Only the app decides that a site is closed.

use tauri::{AppHandle, State};
use tauri_plugin_siteview::{SetBlockedRequest, SiteviewExt, validate::parse_session_id};

use crate::entitlement::Entitlement;
use crate::error::Result;
use crate::usage::{Usage, UsageLimits, UsagePolicy};

/// The daily warning and limit of every site and every part of a site the user set one for.
#[tauri::command]
pub fn get_usage_limits(
    usage: State<'_, Usage>,
    entitlement: State<'_, Entitlement>,
) -> Result<UsageLimits> {
    entitlement.require_pro()?;
    usage.limits()
}

/// Saves the daily warning and limit for one site and returns every limit. A policy with
/// neither step removes the site's policy, which is how a limit is lifted.
#[tauri::command]
pub fn set_usage_limit(
    usage: State<'_, Usage>,
    entitlement: State<'_, Entitlement>,
    host: String,
    policy: UsagePolicy,
) -> Result<UsageLimits> {
    entitlement.require_pro()?;
    usage.set_limit(&host, policy)
}

/// Saves the daily warning and limit for one part of a site, such as Reels inside Instagram,
/// and returns every limit. A policy with neither step removes the part's policy, which is how
/// a limit is lifted.
#[tauri::command]
pub fn set_usage_section_limit(
    usage: State<'_, Usage>,
    entitlement: State<'_, Entitlement>,
    host: String,
    section: String,
    policy: UsagePolicy,
) -> Result<UsageLimits> {
    entitlement.require_pro()?;
    usage.set_section_limit(&host, &section, policy)
}

/// Closes one open site for the day, or opens it again. The block is native: a shield covers
/// the page, the page takes no touches, stops loading and stops playing media, and every
/// navigation it asks for is refused, so it cannot work around the block or open another site
/// in its place.
///
/// Async because the plugin waits for native code that needs the main thread: a synchronous
/// command would deadlock the app.
#[tauri::command]
pub async fn set_usage_blocked(
    app: AppHandle,
    entitlement: State<'_, Entitlement>,
    session: String,
    blocked: bool,
) -> Result<()> {
    if blocked {
        entitlement.require_pro()?;
    }
    parse_session_id(&session)?;
    app.siteview()
        .set_blocked(SetBlockedRequest { session, blocked })?;
    Ok(())
}
