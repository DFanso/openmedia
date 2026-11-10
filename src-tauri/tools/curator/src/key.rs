//! The only module that touches the private key. The key is read into zeroizing memory, checked
//! to be a valid Ed25519 PKCS#8 key, and is never printed or put in an error.

use std::{fs::File, io::Read, path::Path};

use base64::{Engine, engine::general_purpose::STANDARD};
use openmedia_lib::catalog::index::{self, Index, SignedIndex, TrustedKey};
use zeroize::Zeroizing;

use crate::error::{Error, Result};
use crate::ids::parse_key_id;

const MAX_KEY_FILE_BYTES: u64 = 4096;

pub struct Signer {
    pkcs8: Zeroizing<Vec<u8>>,
    key_id: String,
    public: [u8; 32],
}

impl Signer {
    pub fn from_pkcs8(pkcs8: Zeroizing<Vec<u8>>, key_id: &str) -> Result<Self> {
        let public = index::public_key_of(&pkcs8)
            .map_err(|_| Error::Key("the file is not a valid Ed25519 PKCS#8 key".into()))?;
        Ok(Self {
            pkcs8,
            key_id: parse_key_id(key_id)?,
            public,
        })
    }

    pub fn load(path: &Path, key_id: &str) -> Result<Self> {
        let mut file = File::open(path)
            .map_err(|error| Error::Key(format!("cannot open {}: {error}", path.display())))?;
        refuse_exposed(&file, path)?;
        let mut bytes = Zeroizing::new(Vec::new());
        file.by_ref()
            .take(MAX_KEY_FILE_BYTES)
            .read_to_end(&mut bytes)?;
        Self::from_pkcs8(bytes, key_id)
    }

    pub fn key_id(&self) -> &str {
        &self.key_id
    }

    pub fn trusted(&self) -> TrustedKey {
        TrustedKey {
            id: self.key_id.clone(),
            public: self.public,
        }
    }

    pub fn sign(&self, index: &Index) -> Result<SignedIndex> {
        Ok(index::sign(index, &self.pkcs8)?)
    }
}

fn config_line(key_id: &str, public: &[u8; 32]) -> String {
    format!(
        "OPENMEDIA_CATALOG_KEYS={key_id}:{}",
        STANDARD.encode(public)
    )
}

#[cfg(unix)]
fn refuse_exposed(file: &File, path: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;

    let metadata = file.metadata()?;
    if !metadata.is_file() {
        return Err(Error::Key(format!(
            "{} is not a regular file",
            path.display()
        )));
    }
    let mode = metadata.permissions().mode() & 0o777;
    if mode & 0o077 != 0 {
        return Err(Error::Key(format!(
            "{} is readable by other users (mode {mode:o}); run `chmod 600 {}` and consider the key exposed",
            path.display(),
            path.display()
        )));
    }
    Ok(())
}

#[cfg(not(unix))]
fn refuse_exposed(file: &File, path: &Path) -> Result<()> {
    if file.metadata()?.is_file() {
        Ok(())
    } else {
        Err(Error::Key(format!(
            "{} is not a regular file",
            path.display()
        )))
    }
}

#[cfg(unix)]
fn create_private(path: &Path) -> std::io::Result<File> {
    use std::os::unix::fs::OpenOptionsExt;

    std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(path)
}

#[cfg(not(unix))]
fn create_private(path: &Path) -> std::io::Result<File> {
    std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
}

/// Creates a new signing key at `out` (mode 0600 from the moment it exists, never overwriting)
/// and returns the build-config line holding only the public key.
pub fn keygen(out: &Path, key_id: &str) -> Result<String> {
    use std::io::Write;

    let key_id = parse_key_id(key_id)?;
    let (pkcs8, public) = index::generate_key()?;
    let pkcs8 = Zeroizing::new(pkcs8);
    let mut file = create_private(out).map_err(|error| match error.kind() {
        std::io::ErrorKind::AlreadyExists => Error::Refused(format!(
            "{} already exists; refusing to overwrite a signing key",
            out.display()
        )),
        _ => Error::Io(error),
    })?;
    file.write_all(&pkcs8)?;
    file.sync_all()?;
    Ok(config_line(&key_id, &public))
}

#[cfg(test)]
pub mod tests {
    use super::*;

    pub fn test_signer() -> Signer {
        let (pkcs8, _) = index::generate_key().unwrap();
        Signer::from_pkcs8(Zeroizing::new(pkcs8), "k1").unwrap()
    }

    #[cfg(unix)]
    fn mode_of(path: &Path) -> u32 {
        use std::os::unix::fs::PermissionsExt;
        std::fs::metadata(path).unwrap().permissions().mode() & 0o777
    }

    #[cfg(unix)]
    #[test]
    fn keygen_writes_a_private_key_and_prints_only_the_public_line() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("curator.key");
        let line = keygen(&path, "k7").unwrap();
        assert_eq!(mode_of(&path), 0o600);
        let signer = Signer::load(&path, "k7").unwrap();
        assert_eq!(line, config_line("k7", &signer.public));
        assert!(line.starts_with("OPENMEDIA_CATALOG_KEYS=k7:"));
        let private = STANDARD.encode(std::fs::read(&path).unwrap());
        assert!(!line.contains(&private));
    }

    #[test]
    fn keygen_never_overwrites() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("curator.key");
        std::fs::write(&path, b"precious").unwrap();
        assert!(matches!(keygen(&path, "k1"), Err(Error::Refused(_))));
        assert_eq!(std::fs::read(&path).unwrap(), b"precious");
    }

    #[cfg(unix)]
    #[test]
    fn a_group_or_world_readable_key_is_refused() {
        use std::os::unix::fs::PermissionsExt;

        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("curator.key");
        keygen(&path, "k1").unwrap();
        for mode in [0o640, 0o604, 0o644, 0o660] {
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(mode)).unwrap();
            let error = Signer::load(&path, "k1").err().unwrap();
            assert!(matches!(error, Error::Key(_)), "{mode:o}");
        }
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o400)).unwrap();
        assert!(Signer::load(&path, "k1").is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn a_file_that_is_not_a_key_is_refused_without_echoing_it() {
        use std::os::unix::fs::PermissionsExt;

        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("junk.key");
        std::fs::write(&path, b"super-secret-looking-text").unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).unwrap();
        let message = Signer::load(&path, "k1").err().unwrap().to_string();
        assert!(!message.contains("super-secret"));
    }

    #[test]
    fn a_key_id_with_separators_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        assert!(keygen(&dir.path().join("k"), "a:b").is_err());
    }
}
