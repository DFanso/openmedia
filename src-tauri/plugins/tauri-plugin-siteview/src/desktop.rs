use std::marker::PhantomData;

use serde::de::DeserializeOwned;
use tauri::{AppHandle, Runtime, plugin::PluginApi};

use crate::models::*;
use crate::{Error, Result};

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> Result<Siteview<R>> {
    Ok(Siteview(PhantomData))
}

/// Desktop site views (a Tauri child webview) are not implemented yet; mobile ships first.
pub struct Siteview<R: Runtime>(PhantomData<fn() -> R>);

impl<R: Runtime> Siteview<R> {
    pub fn open(&self, _request: OpenRequest) -> Result<()> {
        Err(Error::DesktopUnsupported)
    }

    pub fn activate(&self, _request: SessionRequest) -> Result<()> {
        Err(Error::DesktopUnsupported)
    }

    pub fn close(&self, _request: SessionRequest) -> Result<()> {
        Err(Error::DesktopUnsupported)
    }

    pub fn set_rect(&self, _request: SetRectRequest) -> Result<()> {
        Err(Error::DesktopUnsupported)
    }

    pub fn set_interactive_regions(&self, _request: SetInteractiveRegionsRequest) -> Result<()> {
        Err(Error::DesktopUnsupported)
    }

    pub fn navigate(&self, _request: NavigateRequest) -> Result<()> {
        Err(Error::DesktopUnsupported)
    }

    pub fn go_back(&self) -> Result<()> {
        Err(Error::DesktopUnsupported)
    }

    pub fn go_forward(&self) -> Result<()> {
        Err(Error::DesktopUnsupported)
    }

    pub fn reload(&self) -> Result<()> {
        Err(Error::DesktopUnsupported)
    }
}

impl<R: Runtime> Siteview<R> {
    pub fn set_color_scheme(&self, _request: SetColorSchemeRequest) -> Result<()> {
        Err(Error::DesktopUnsupported)
    }

    pub fn fetch_favicon(&self, _request: FetchFaviconRequest) -> Result<Option<String>> {
        Err(Error::DesktopUnsupported)
    }

    pub fn set_content_rule_lists(&self, _request: SetContentRuleListsRequest) -> Result<()> {
        Err(Error::DesktopUnsupported)
    }
}
