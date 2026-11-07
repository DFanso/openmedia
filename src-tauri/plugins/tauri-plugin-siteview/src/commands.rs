use tauri::{AppHandle, Runtime, command};

use crate::models::*;
use crate::validate::{parse_profile_id, parse_web_url};
use crate::{Result, SiteviewExt};

#[command]
pub(crate) async fn open<R: Runtime>(app: AppHandle<R>, request: OpenRequest) -> Result<()> {
    parse_profile_id(&request.profile)?;
    parse_web_url(&request.url)?;
    app.siteview().open(request)
}

#[command]
pub(crate) async fn close<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.siteview().close()
}

#[command]
pub(crate) async fn set_rect<R: Runtime>(app: AppHandle<R>, request: SetRectRequest) -> Result<()> {
    app.siteview().set_rect(request)
}

#[command]
pub(crate) async fn set_interactive_regions<R: Runtime>(
    app: AppHandle<R>,
    request: SetInteractiveRegionsRequest,
) -> Result<()> {
    app.siteview().set_interactive_regions(request)
}

#[command]
pub(crate) async fn navigate<R: Runtime>(
    app: AppHandle<R>,
    request: NavigateRequest,
) -> Result<()> {
    parse_web_url(&request.url)?;
    app.siteview().navigate(request)
}

#[command]
pub(crate) async fn go_back<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.siteview().go_back()
}

#[command]
pub(crate) async fn go_forward<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.siteview().go_forward()
}

#[command]
pub(crate) async fn reload<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.siteview().reload()
}
