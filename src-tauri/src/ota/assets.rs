use std::{borrow::Cow, sync::Arc};

use tauri::{
    App, Assets, Context, Runtime,
    utils::assets::{AssetKey, AssetsIter, CspHash},
};

use super::Ota;

/// Serves the verified bundle in place of the shell compiled into the app. With no bundle it is
/// the embedded assets, untouched. With one it serves only from the bundle: a page from one
/// build must never load a script from another.
pub struct OtaAssets<R: Runtime> {
    embedded: Box<dyn Assets<R>>,
    ota: Arc<Ota>,
}

impl<R: Runtime> OtaAssets<R> {
    /// Wraps the assets the app was built with.
    pub fn install(context: &mut Context<R>, ota: Arc<Ota>) {
        let embedded = context.set_assets(Box::new(Nothing));
        context.set_assets(Box::new(Self { embedded, ota }));
    }
}

/// Stands in while the embedded assets change hands.
struct Nothing;

impl<R: Runtime> Assets<R> for Nothing {
    fn get(&self, _key: &AssetKey) -> Option<Cow<'_, [u8]>> {
        None
    }

    fn iter(&self) -> Box<AssetsIter<'_>> {
        Box::new(std::iter::empty())
    }

    fn csp_hashes(&self, _html_path: &AssetKey) -> Box<dyn Iterator<Item = CspHash<'_>> + '_> {
        Box::new(std::iter::empty())
    }
}

impl<R: Runtime> Assets<R> for OtaAssets<R> {
    fn setup(&self, app: &App<R>) {
        self.ota.init(app);
        self.embedded.setup(app);
    }

    fn get(&self, key: &AssetKey) -> Option<Cow<'_, [u8]>> {
        match self.ota.running().bundle.as_ref() {
            Some(bundle) => bundle.get(key.as_ref()).map(Cow::Borrowed),
            None => self.embedded.get(key),
        }
    }

    fn iter(&self) -> Box<AssetsIter<'_>> {
        self.embedded.iter()
    }

    fn csp_hashes(&self, html_path: &AssetKey) -> Box<dyn Iterator<Item = CspHash<'_>> + '_> {
        self.embedded.csp_hashes(html_path)
    }
}
