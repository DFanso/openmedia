//! The signed web bundle: what `scripts/ota.mjs` publishes and how the app decides to trust it.
//! Pure functions; nothing here touches the disk or the network.
//!
//! A packed bundle is `signature (64 bytes) ‖ gzip(manifest JSON)`. The signature is Ed25519 over
//! `SIGNING_CONTEXT ‖ gzip bytes`, so nothing is decompressed or parsed before it is checked.

use std::{collections::HashMap, io::Read};

use base64::{Engine, engine::general_purpose::STANDARD};
use flate2::read::GzDecoder;
use ring::signature::{ED25519, UnparsedPublicKey};
use serde::Deserialize;

use crate::error::{Error, Result};

pub const FORMAT: u32 = 1;
const SIGNING_CONTEXT: &[u8] = b"openmedia-ota-v1\n";
pub const SIGNATURE_BYTES: usize = 64;
pub const PUBLIC_KEY_BYTES: usize = 32;
pub const MAX_PACKED_BYTES: usize = 32 * 1024 * 1024;
const MAX_MANIFEST_BYTES: u64 = 96 * 1024 * 1024;
const MAX_FILES: usize = 2000;
const MAX_UNPACKED_BYTES: usize = 64 * 1024 * 1024;
const ENTRY_POINT: &str = "index.html";

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Manifest {
    format: u32,
    runtime_version: String,
    revision: u64,
    files: HashMap<String, String>,
}

/// A bundle whose signature, runtime and files have all been checked.
#[derive(Debug)]
pub struct Bundle {
    pub revision: u64,
    files: HashMap<String, Vec<u8>>,
}

impl Bundle {
    /// `path` is a request path such as `/assets/index.js`.
    pub fn get(&self, path: &str) -> Option<&[u8]> {
        self.files
            .get(path.trim_start_matches('/'))
            .map(Vec::as_slice)
    }
}

/// Trusts `packed` only if `key` signed exactly these bytes and it was built for `runtime`, the
/// native app's version. A bundle for another runtime may call commands this binary lacks.
pub fn open(packed: &[u8], key: &[u8; PUBLIC_KEY_BYTES], runtime: &str) -> Result<Bundle> {
    if packed.len() > MAX_PACKED_BYTES {
        return Err(refuse("the update is too large"));
    }
    let (signature, compressed) = packed
        .split_at_checked(SIGNATURE_BYTES)
        .ok_or_else(|| refuse("the update is incomplete"))?;
    let message = [SIGNING_CONTEXT, compressed].concat();
    UnparsedPublicKey::new(&ED25519, key)
        .verify(&message, signature)
        .map_err(|_| refuse("the update signature is not valid"))?;

    let mut json = Vec::new();
    GzDecoder::new(compressed)
        .take(MAX_MANIFEST_BYTES + 1)
        .read_to_end(&mut json)
        .map_err(|_| refuse("the update is corrupt"))?;
    if json.len() as u64 > MAX_MANIFEST_BYTES {
        return Err(refuse("the update is too large"));
    }
    let manifest: Manifest =
        serde_json::from_slice(&json).map_err(|_| refuse("the update is malformed"))?;
    if manifest.format != FORMAT {
        return Err(refuse("the update has an unsupported format"));
    }
    if manifest.runtime_version != runtime {
        return Err(refuse("the update is for another version of the app"));
    }
    decode_files(manifest)
}

fn decode_files(manifest: Manifest) -> Result<Bundle> {
    if manifest.files.len() > MAX_FILES {
        return Err(refuse("the update has too many files"));
    }
    let mut total = 0usize;
    let mut files = HashMap::with_capacity(manifest.files.len());
    for (path, encoded) in manifest.files {
        if !is_safe_path(&path) {
            return Err(refuse("the update names an invalid file"));
        }
        let bytes = STANDARD
            .decode(encoded)
            .map_err(|_| refuse("the update is malformed"))?;
        total = total.saturating_add(bytes.len());
        if total > MAX_UNPACKED_BYTES {
            return Err(refuse("the update is too large"));
        }
        files.insert(path, bytes);
    }
    if !files.contains_key(ENTRY_POINT) {
        return Err(refuse("the update has no start page"));
    }
    Ok(Bundle {
        revision: manifest.revision,
        files,
    })
}

fn is_safe_path(path: &str) -> bool {
    !path.is_empty()
        && !path.contains('\\')
        && path
            .split('/')
            .all(|part| !part.is_empty() && part != "." && part != "..")
}

fn refuse(reason: &str) -> Error {
    Error::Ota(reason.into())
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use flate2::{Compression, write::GzEncoder};
    use ring::{
        rand::SystemRandom,
        signature::{Ed25519KeyPair, KeyPair},
    };
    use serde_json::json;

    use super::*;

    struct Signer(Ed25519KeyPair);

    impl Signer {
        fn new() -> Self {
            let pkcs8 = Ed25519KeyPair::generate_pkcs8(&SystemRandom::new()).unwrap();
            Self(Ed25519KeyPair::from_pkcs8(pkcs8.as_ref()).unwrap())
        }

        fn public(&self) -> [u8; PUBLIC_KEY_BYTES] {
            self.0.public_key().as_ref().try_into().unwrap()
        }

        fn pack(&self, manifest: &serde_json::Value) -> Vec<u8> {
            let mut gzip = GzEncoder::new(Vec::new(), Compression::fast());
            gzip.write_all(manifest.to_string().as_bytes()).unwrap();
            let compressed = gzip.finish().unwrap();
            let signature = self.0.sign(&[SIGNING_CONTEXT, &compressed].concat());
            [signature.as_ref(), &compressed].concat()
        }
    }

    fn manifest() -> serde_json::Value {
        json!({
            "format": 1,
            "runtimeVersion": "1.0.0",
            "revision": 7,
            "files": {
                "index.html": STANDARD.encode("<html></html>"),
                "assets/app.js": STANDARD.encode("run()"),
            },
        })
    }

    fn with_files(files: serde_json::Value) -> serde_json::Value {
        let mut value = manifest();
        value["files"] = files;
        value
    }

    #[test]
    fn a_signed_bundle_for_this_runtime_opens() {
        let signer = Signer::new();
        let bundle = open(&signer.pack(&manifest()), &signer.public(), "1.0.0").unwrap();
        assert_eq!(bundle.revision, 7);
        assert_eq!(bundle.get("/assets/app.js"), Some(b"run()".as_slice()));
        assert_eq!(bundle.get("/index.html"), Some(b"<html></html>".as_slice()));
        assert_eq!(bundle.get("/missing.js"), None);
    }

    /// Written by `scripts/lib/ota-bundle.mjs` (see the fixture's key, which signs nothing real):
    /// the two sides of the format must agree byte for byte.
    #[test]
    fn a_bundle_the_cli_signed_opens() {
        let key: [u8; PUBLIC_KEY_BYTES] = STANDARD
            .decode(include_str!("fixtures/node-signed.pub").trim())
            .unwrap()
            .try_into()
            .unwrap();
        let bundle = open(include_bytes!("fixtures/node-signed.ota"), &key, "1.0.0").unwrap();
        assert_eq!(bundle.revision, 42);
        assert_eq!(bundle.get("/assets/app.js"), Some(b"run()".as_slice()));
        let index = String::from_utf8(bundle.get("/index.html").unwrap().to_vec()).unwrap();
        assert!(index.contains(r#"<style nonce="__TAURI_STYLE_NONCE__">"#));
    }

    #[test]
    fn another_key_is_refused() {
        let packed = Signer::new().pack(&manifest());
        assert!(open(&packed, &Signer::new().public(), "1.0.0").is_err());
    }

    #[test]
    fn a_changed_byte_is_refused() {
        let signer = Signer::new();
        let mut packed = signer.pack(&manifest());
        let last = packed.len() - 1;
        packed[last] ^= 1;
        assert!(open(&packed, &signer.public(), "1.0.0").is_err());
    }

    #[test]
    fn a_bundle_for_another_runtime_is_refused() {
        let signer = Signer::new();
        let packed = signer.pack(&manifest());
        assert!(open(&packed, &signer.public(), "1.0.1").is_err());
    }

    #[test]
    fn unsafe_paths_are_refused() {
        let signer = Signer::new();
        let index = STANDARD.encode("x");
        for path in ["../index.html", "/etc/passwd", "a//b", "a\\b", "./a"] {
            let files = json!({ "index.html": index, path: index });
            let packed = signer.pack(&with_files(files));
            assert!(open(&packed, &signer.public(), "1.0.0").is_err(), "{path}");
        }
    }

    #[test]
    fn a_bundle_without_a_start_page_is_refused() {
        let signer = Signer::new();
        let packed = signer.pack(&with_files(json!({ "a.js": STANDARD.encode("x") })));
        assert!(open(&packed, &signer.public(), "1.0.0").is_err());
    }

    #[test]
    fn an_unknown_format_or_field_is_refused() {
        let signer = Signer::new();
        let mut future = manifest();
        future["format"] = json!(2);
        assert!(open(&signer.pack(&future), &signer.public(), "1.0.0").is_err());
        let mut extra = manifest();
        extra["script"] = json!("x");
        assert!(open(&signer.pack(&extra), &signer.public(), "1.0.0").is_err());
    }

    #[test]
    fn a_truncated_bundle_is_refused() {
        let signer = Signer::new();
        assert!(open(&[0; 10], &signer.public(), "1.0.0").is_err());
    }
}
