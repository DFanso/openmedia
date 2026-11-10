//! The curator's write path: approve, reject, revoke, republish. Every command validates and
//! signs completely before its first remote write, and publishes in the order recipe file,
//! `index.json`, `index.json.sig`.

use openmedia_lib::catalog::index::{self, Entry, INDEX_FORMAT, Index, Revoked, SignedIndex};

use crate::error::{Error, Result};
use crate::ids::{RecipeId, SubmissionId, Version, parse_sha256, printable};
use crate::inspect::{Pending, listed_host, load_pending};
use crate::key::Signer;
use crate::store::{INDEX_KEY, SIGNATURE_KEY, Status, Store, pending_key, recipe_key};

/// How long a signed index stays valid. Devices refuse it afterwards, so `republish` must run
/// well before this runs out.
pub const VALIDITY_SECONDS: i64 = 30 * 24 * 60 * 60;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IndexTrust {
    /// The published index must verify against the signing key before it is built upon.
    Verified,
    /// Recovery after a publish died between `index.json` and `index.json.sig`.
    AcceptUnsigned,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Issued {
    pub sequence: u64,
    pub issued_at: i64,
    pub expires_at: i64,
}

impl From<&Index> for Issued {
    fn from(index: &Index) -> Self {
        Self {
            sequence: index.sequence,
            issued_at: index.issued_at,
            expires_at: index.expires_at,
        }
    }
}

pub fn read_index_unverified(store: &dyn Store) -> Result<Option<Index>> {
    store
        .get_object(INDEX_KEY)?
        .map(|bytes| serde_json::from_slice(&bytes).map_err(Error::from))
        .transpose()
}

fn load_index(store: &dyn Store, signer: &Signer, trust: IndexTrust) -> Result<Option<Index>> {
    let Some(bytes) = store.get_object(INDEX_KEY)? else {
        return Ok(None);
    };
    if trust == IndexTrust::AcceptUnsigned {
        return Ok(Some(serde_json::from_slice(&bytes)?));
    }
    let signature = store.get_object(SIGNATURE_KEY)?.ok_or_else(|| {
        Error::Refused(
            "index.json has no index.json.sig beside it; if a publish was interrupted, check the \
             index and re-run `republish --accept-unsigned-index`"
                .into(),
        )
    })?;
    let signature = String::from_utf8_lossy(&signature);
    index::verify(&bytes, &signature, &[signer.trusted()], 0, 0)
        .map(Some)
        .map_err(|error| {
            Error::Refused(format!(
                "the published catalog does not verify against your key ({error}); not building on it. \
                 If a publish was interrupted, inspect index.json and re-run `republish --accept-unsigned-index`"
            ))
        })
}

fn empty_index(signer: &Signer, now: i64) -> Index {
    Index {
        format: INDEX_FORMAT,
        key_id: signer.key_id().to_owned(),
        sequence: 0,
        issued_at: now,
        expires_at: now,
        recipes: Vec::new(),
        revoked: Vec::new(),
    }
}

fn reissue(index: &mut Index, signer: &Signer, now: i64) {
    index.key_id = signer.key_id().to_owned();
    index.sequence += 1;
    index.issued_at = now;
    index.expires_at = now + VALIDITY_SECONDS;
}

fn upload_index(store: &dyn Store, signed: &SignedIndex) -> Result<()> {
    store.put_object(INDEX_KEY, &signed.bytes)?;
    store.put_object(SIGNATURE_KEY, signed.signature.as_bytes())
}

fn sign_and_upload(store: &dyn Store, signer: &Signer, index: &Index) -> Result<Issued> {
    upload_index(store, &signer.sign(index)?)?;
    Ok(index.into())
}

pub fn hosts_of(patterns: &[String]) -> Vec<String> {
    let mut hosts: Vec<String> = Vec::new();
    for host in patterns.iter().filter_map(|pattern| listed_host(pattern)) {
        if !hosts.contains(&host) {
            hosts.push(host);
        }
    }
    hosts
}

#[derive(Debug)]
pub struct Approved {
    pub recipe_id: String,
    pub version: String,
    pub sha256: String,
    pub size: u64,
    pub issued: Issued,
}

fn entry_for(pending: &Pending, bytes: &[u8], featured: bool, now: i64) -> Entry {
    let recipe = &pending.recipe;
    Entry {
        id: recipe.id.clone(),
        name: recipe.name.clone(),
        version: recipe.version.clone(),
        author: recipe
            .meta
            .as_ref()
            .and_then(|meta| meta.author.clone())
            .unwrap_or_default(),
        summary: pending.summary.clone(),
        hosts: hosts_of(&recipe.matches),
        sha256: index::sha256_hex(bytes),
        size: bytes.len() as u64,
        published_at: now,
        featured,
    }
}

fn refuse_unless_newer(index: &Index, pending: &Pending) -> Result<()> {
    let Some(published) = index::entry(index, &pending.recipe.id) else {
        return Ok(());
    };
    let newer = Version::parse(&published.version)
        .map(|old| pending.version.is_newer_than(&old))
        .unwrap_or(false);
    if newer {
        Ok(())
    } else {
        Err(Error::Refused(format!(
            "{} {} is not newer than the published {}",
            pending.recipe_id,
            pending.version,
            printable(&published.version)
        )))
    }
}

pub fn approve(
    store: &dyn Store,
    signer: &Signer,
    id: &SubmissionId,
    featured: bool,
    now: i64,
) -> Result<Approved> {
    let pending = load_pending(store, id)?;
    let bytes = serde_json::to_vec(&pending.recipe)?;
    let key = recipe_key(&pending.recipe_id, &pending.version);
    if store.get_object(&key)?.is_some() {
        return Err(Error::Refused(format!(
            "{key} already exists; published versions are immutable, ask the author for a new version"
        )));
    }
    let mut index = load_index(store, signer, IndexTrust::Verified)?
        .unwrap_or_else(|| empty_index(signer, now));
    refuse_unless_newer(&index, &pending)?;
    let entry = entry_for(&pending, &bytes, featured, now);
    index.recipes.retain(|existing| existing.id != entry.id);
    index.recipes.push(entry.clone());
    reissue(&mut index, signer, now);
    let signed = signer.sign(&index)?;

    store.put_object(&key, &bytes)?;
    upload_index(store, &signed)?;
    store.set_submission_status(id, Status::Approved)?;
    store.delete_object(&pending_key(id))?;
    Ok(Approved {
        recipe_id: entry.id,
        version: entry.version,
        sha256: entry.sha256,
        size: entry.size,
        issued: (&index).into(),
    })
}

pub fn reject(store: &dyn Store, id: &SubmissionId) -> Result<()> {
    let row = store
        .submission(id)?
        .ok_or_else(|| Error::NotFound(format!("submission {id} is not in the database")))?;
    if row.status != "pending" {
        return Err(Error::Refused(format!(
            "submission {id} is already {}",
            printable(&row.status)
        )));
    }
    store.set_submission_status(id, Status::Rejected)?;
    store.delete_object(&pending_key(id))
}

pub struct RevokeRequest<'a> {
    pub id: &'a RecipeId,
    pub version: Option<&'a Version>,
    pub sha256: Option<&'a str>,
}

#[derive(Debug)]
pub struct Revocation {
    pub sha256: String,
    pub delisted: bool,
    pub issued: Issued,
}

fn sha_to_revoke(
    store: &dyn Store,
    request: &RevokeRequest,
    listed: Option<&Entry>,
) -> Result<String> {
    if let Some(sha256) = request.sha256 {
        return parse_sha256(sha256);
    }
    match (request.version, listed) {
        (Some(version), Some(entry)) if entry.version == version.as_str() => {
            Ok(entry.sha256.clone())
        }
        (Some(version), _) => store
            .get_object(&recipe_key(request.id, version))?
            .map(|bytes| index::sha256_hex(&bytes))
            .ok_or_else(|| {
                Error::NotFound(format!(
                    "{} {version} is not in the bucket; pass its hash with --sha256",
                    request.id
                ))
            }),
        (None, Some(entry)) => Ok(entry.sha256.clone()),
        (None, None) => Err(Error::NotFound(format!(
            "{} is not listed; pass --version or --sha256",
            request.id
        ))),
    }
}

pub fn revoke(
    store: &dyn Store,
    signer: &Signer,
    request: &RevokeRequest,
    now: i64,
) -> Result<Revocation> {
    let mut index = load_index(store, signer, IndexTrust::Verified)?
        .ok_or_else(|| Error::NotFound("there is no published catalog yet".into()))?;
    let listed = index::entry(&index, request.id.as_str()).cloned();
    let sha256 = sha_to_revoke(store, request, listed.as_ref())?;
    if index::is_revoked(&index, request.id.as_str(), &sha256) {
        return Err(Error::Refused(format!(
            "{} {sha256} is already revoked",
            request.id
        )));
    }
    index.revoked.push(Revoked {
        id: request.id.as_str().to_owned(),
        sha256: sha256.clone(),
    });
    let delisted = listed.is_some_and(|entry| entry.sha256 == sha256);
    if delisted {
        index
            .recipes
            .retain(|entry| entry.id != request.id.as_str());
    }
    reissue(&mut index, signer, now);
    let issued = sign_and_upload(store, signer, &index)?;
    Ok(Revocation {
        sha256,
        delisted,
        issued,
    })
}

pub fn republish(
    store: &dyn Store,
    signer: &Signer,
    trust: IndexTrust,
    now: i64,
) -> Result<Issued> {
    let mut index = load_index(store, signer, trust)?
        .ok_or_else(|| Error::NotFound("there is no published catalog yet".into()))?;
    reissue(&mut index, signer, now);
    sign_and_upload(store, signer, &index)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fake::Write;
    use crate::testing::*;
    use openmedia_lib::catalog::index::{check_download, verify};

    fn published(fixture: &Fixture) -> (Index, Vec<u8>, String) {
        let bytes = fixture.store.object(INDEX_KEY).unwrap();
        let signature = String::from_utf8(fixture.store.object(SIGNATURE_KEY).unwrap()).unwrap();
        let key = [fixture.signer.trusted()];
        let index = verify(&bytes, &signature, &key, NOW, 0).unwrap();
        (index, bytes, signature)
    }

    #[test]
    fn approving_publishes_a_signed_index_over_the_exact_stored_bytes() {
        let fixture = Fixture::new();
        let id = fixture.submit(&recipe_json(
            "market.calm",
            "1.0.0",
            2,
            "https://*.example.com/*",
        ));
        let approved = approve(&fixture.store, &fixture.signer, &id, true, NOW).unwrap();

        let (index, _, _) = published(&fixture);
        let entry = &index.recipes[0];
        assert_eq!(index.sequence, 1);
        assert_eq!(index.issued_at, NOW);
        assert_eq!(index.expires_at, NOW + 30 * 24 * 60 * 60);
        assert_eq!(index.key_id, "k1");
        assert_eq!(entry.id, "market.calm");
        assert_eq!(entry.version, "1.0.0");
        assert_eq!(entry.author, "Ada");
        assert_eq!(entry.summary, "Quieter pages");
        assert_eq!(entry.hosts, vec!["example.com"]);
        assert_eq!(entry.published_at, NOW);
        assert!(entry.featured);
        assert_eq!(approved.sha256, entry.sha256);

        let stored = fixture
            .store
            .object("recipes/market.calm/1.0.0.json")
            .unwrap();
        assert_eq!(index::sha256_hex(&stored), entry.sha256);
        assert_eq!(stored.len() as u64, entry.size);
        assert!(check_download(&index, "market.calm", &stored).is_ok());
        assert_eq!(
            fixture.store.status_of(id.as_str()).as_deref(),
            Some("approved")
        );
        assert!(fixture.store.object(&pending_key(&id)).is_none());
    }

    #[test]
    fn the_publish_order_is_recipe_then_index_then_signature_then_cleanup() {
        let fixture = Fixture::new();
        let id = fixture.submit(&recipe_json(
            "market.calm",
            "1.0.0",
            1,
            "https://*.example.com/*",
        ));
        approve(&fixture.store, &fixture.signer, &id, false, NOW).unwrap();
        let writes: Vec<Write> = fixture
            .store
            .writes()
            .into_iter()
            .filter(|w| !matches!(w, Write::Put(key) if key.starts_with("pending/")))
            .collect();
        assert_eq!(
            writes,
            vec![
                Write::Put("recipes/market.calm/1.0.0.json".into()),
                Write::Put("index.json".into()),
                Write::Put("index.json.sig".into()),
                Write::Status(id.to_string(), "approved"),
                Write::Delete(pending_key(&id)),
            ]
        );
    }

    #[test]
    fn a_second_recipe_and_a_newer_version_extend_and_replace() {
        let fixture = Fixture::new();
        fixture.publish(&recipe_json(
            "market.calm",
            "1.0.0",
            1,
            "https://*.example.com/*",
        ));
        fixture.publish(&recipe_json(
            "market.other",
            "1.0.0",
            1,
            "https://other.org/*",
        ));
        fixture.publish(&recipe_json(
            "market.calm",
            "1.1.0",
            2,
            "https://*.example.com/*",
        ));
        let (index, _, _) = published(&fixture);
        assert_eq!(index.sequence, 3);
        assert_eq!(index.recipes.len(), 2);
        assert_eq!(
            index::entry(&index, "market.calm").unwrap().version,
            "1.1.0"
        );
        assert!(
            fixture
                .store
                .object("recipes/market.calm/1.0.0.json")
                .is_some()
        );
    }

    #[test]
    fn a_duplicate_or_older_version_is_refused_and_nothing_changes() {
        let fixture = Fixture::new();
        fixture.publish(&recipe_json(
            "market.calm",
            "1.2.0",
            1,
            "https://*.example.com/*",
        ));
        for version in ["1.2.0", "1.1.9", "0.9.0"] {
            let id = fixture.submit(&recipe_json(
                "market.calm",
                version,
                1,
                "https://*.example.com/*",
            ));
            let before = fixture.store.snapshot();
            let error = approve(&fixture.store, &fixture.signer, &id, false, NOW + 5).unwrap_err();
            assert!(matches!(error, Error::Refused(_)), "{version}: {error}");
            assert_eq!(fixture.store.snapshot(), before, "{version}");
        }
    }

    #[test]
    fn an_existing_recipe_file_blocks_approval() {
        let fixture = Fixture::new();
        fixture
            .store
            .insert_object("recipes/market.calm/1.0.0.json", b"{}");
        let id = fixture.submit(&recipe_json(
            "market.calm",
            "1.0.0",
            1,
            "https://*.example.com/*",
        ));
        assert!(matches!(
            approve(&fixture.store, &fixture.signer, &id, false, NOW),
            Err(Error::Refused(_))
        ));
        assert_eq!(
            fixture
                .store
                .object("recipes/market.calm/1.0.0.json")
                .unwrap(),
            b"{}"
        );
    }

    #[test]
    fn invalid_submissions_change_nothing_remotely() {
        let fixture = Fixture::new();
        let good = recipe_json("market.calm", "1.0.0", 1, "https://*.example.com/*");
        let cases = [
            (
                "script",
                good.replace(r#""type":"css""#, r#""type":"script""#),
            ),
            (
                "broad",
                recipe_json("market.calm", "1.0.0", 1, "https://*/*"),
            ),
            (
                "bad-version",
                recipe_json("market.calm", "latest", 1, "https://*.example.com/*"),
            ),
            (
                "unknown field",
                good.replace(r#""schema":1"#, r#""schema":1,"evil":true"#),
            ),
        ];
        for (name, json) in cases {
            let id = fixture.submit(&json);
            let before = fixture.store.snapshot();
            let error = approve(&fixture.store, &fixture.signer, &id, false, NOW).unwrap_err();
            assert!(matches!(error, Error::Validation(_)), "{name}: {error}");
            assert_eq!(fixture.store.snapshot(), before, "{name}");
        }
        let mismatched = fixture.submit_with_row(&good, "market.else", "1.0.0");
        let before = fixture.store.snapshot();
        assert!(matches!(
            approve(&fixture.store, &fixture.signer, &mismatched, false, NOW),
            Err(Error::Validation(_))
        ));
        assert_eq!(fixture.store.snapshot(), before);
        assert!(fixture.store.writes().is_empty());
    }

    #[test]
    fn an_unsignable_entry_is_caught_before_any_upload() {
        let fixture = Fixture::new();
        let json = recipe_json("market.calm", "1.0.0", 1, "https://*.example.com/*");
        let id = fixture.submit_with_summary(&json, &"x".repeat(141));
        let before = fixture.store.snapshot();
        assert!(approve(&fixture.store, &fixture.signer, &id, false, NOW).is_err());
        assert_eq!(fixture.store.snapshot(), before);
    }

    #[test]
    fn an_index_that_does_not_verify_is_not_built_upon() {
        let fixture = Fixture::new();
        fixture.publish(&recipe_json(
            "market.calm",
            "1.0.0",
            1,
            "https://*.example.com/*",
        ));
        let mut tampered = fixture.store.object(INDEX_KEY).unwrap();
        tampered.push(b' ');
        fixture.store.insert_object(INDEX_KEY, &tampered);
        let id = fixture.submit(&recipe_json(
            "market.next",
            "1.0.0",
            1,
            "https://next.org/*",
        ));
        let before = fixture.store.snapshot();
        assert!(matches!(
            approve(&fixture.store, &fixture.signer, &id, false, NOW + 1),
            Err(Error::Refused(_))
        ));
        assert_eq!(fixture.store.snapshot(), before);
    }

    #[test]
    fn a_failed_index_upload_leaves_the_submission_pending() {
        let fixture = Fixture::new();
        let id = fixture.submit(&recipe_json(
            "market.calm",
            "1.0.0",
            1,
            "https://*.example.com/*",
        ));
        fixture.store.fail_puts_of(SIGNATURE_KEY);
        assert!(approve(&fixture.store, &fixture.signer, &id, false, NOW).is_err());
        assert_eq!(
            fixture.store.status_of(id.as_str()).as_deref(),
            Some("pending")
        );
        assert!(fixture.store.object(&pending_key(&id)).is_some());
    }

    #[test]
    fn hosts_drop_the_wildcard_and_repeats() {
        let patterns = [
            "https://*.example.com/*",
            "http://example.com/a",
            "*://Foo.org/*",
        ]
        .map(String::from);
        assert_eq!(hosts_of(&patterns), vec!["example.com", "foo.org"]);
    }

    #[test]
    fn rejecting_marks_the_row_and_deletes_the_body() {
        let fixture = Fixture::new();
        let id = fixture.submit("{ not even json");
        reject(&fixture.store, &id).unwrap();
        assert_eq!(
            fixture.store.status_of(id.as_str()).as_deref(),
            Some("rejected")
        );
        assert!(fixture.store.object(&pending_key(&id)).is_none());
        assert!(matches!(
            reject(&fixture.store, &id),
            Err(Error::Refused(_))
        ));
        let unknown = SubmissionId::parse("00000000-0000-4000-8000-000000000000").unwrap();
        assert!(matches!(
            reject(&fixture.store, &unknown),
            Err(Error::NotFound(_))
        ));
    }

    #[test]
    fn revoking_delists_records_the_hash_and_blocks_the_download() {
        let fixture = Fixture::new();
        fixture.publish(&recipe_json(
            "market.calm",
            "1.0.0",
            1,
            "https://*.example.com/*",
        ));
        fixture.publish(&recipe_json(
            "market.other",
            "1.0.0",
            1,
            "https://other.org/*",
        ));
        let (before, _, _) = published(&fixture);
        let sha = index::entry(&before, "market.calm").unwrap().sha256.clone();
        let stored = fixture
            .store
            .object("recipes/market.calm/1.0.0.json")
            .unwrap();

        let id = RecipeId::parse("market.calm").unwrap();
        let request = RevokeRequest {
            id: &id,
            version: None,
            sha256: None,
        };
        let outcome = revoke(&fixture.store, &fixture.signer, &request, NOW + 9).unwrap();
        assert!(outcome.delisted);
        assert_eq!(outcome.sha256, sha);

        let (index, _, _) = published(&fixture);
        assert_eq!(index.sequence, before.sequence + 1);
        assert!(index::entry(&index, "market.calm").is_none());
        assert!(index::entry(&index, "market.other").is_some());
        assert_eq!(
            index.revoked,
            vec![Revoked {
                id: "market.calm".into(),
                sha256: sha.clone()
            }]
        );
        assert!(index::is_revoked(&index, "market.calm", &sha));
        assert!(check_download(&index, "market.calm", &stored).is_err());
        assert!(matches!(
            revoke(&fixture.store, &fixture.signer, &request, NOW + 10),
            Err(Error::NotFound(_))
        ));
    }

    #[test]
    fn an_unlisted_recipe_is_revoked_by_version_or_by_hash() {
        let fixture = Fixture::new();
        fixture.publish(&recipe_json(
            "market.calm",
            "1.0.0",
            1,
            "https://*.example.com/*",
        ));
        fixture.publish(&recipe_json(
            "market.calm",
            "1.1.0",
            1,
            "https://*.example.com/*",
        ));
        let old = fixture
            .store
            .object("recipes/market.calm/1.0.0.json")
            .unwrap();
        let old_sha = index::sha256_hex(&old);
        let id = RecipeId::parse("market.calm").unwrap();
        let v100 = Version::parse("1.0.0").unwrap();

        let by_version = RevokeRequest {
            id: &id,
            version: Some(&v100),
            sha256: None,
        };
        let outcome = revoke(&fixture.store, &fixture.signer, &by_version, NOW + 1).unwrap();
        assert_eq!(outcome.sha256, old_sha);
        assert!(!outcome.delisted);
        let (index, _, _) = published(&fixture);
        assert_eq!(
            index::entry(&index, "market.calm").unwrap().version,
            "1.1.0"
        );

        let lost = "ab".repeat(32);
        let by_hash = RevokeRequest {
            id: &id,
            version: None,
            sha256: Some(&lost),
        };
        let outcome = revoke(&fixture.store, &fixture.signer, &by_hash, NOW + 2).unwrap();
        assert_eq!(outcome.sha256, lost);
        let (index, _, _) = published(&fixture);
        assert_eq!(index.revoked.len(), 2);

        let missing = Version::parse("9.9.9").unwrap();
        let by_missing = RevokeRequest {
            id: &id,
            version: Some(&missing),
            sha256: None,
        };
        assert!(matches!(
            revoke(&fixture.store, &fixture.signer, &by_missing, NOW + 3),
            Err(Error::NotFound(_))
        ));
        assert!(
            revoke(
                &fixture.store,
                &fixture.signer,
                &RevokeRequest {
                    id: &id,
                    version: None,
                    sha256: Some("nothex")
                },
                NOW + 4
            )
            .is_err()
        );
    }

    #[test]
    fn republishing_bumps_the_sequence_and_the_expiry() {
        let fixture = Fixture::new();
        fixture.publish(&recipe_json(
            "market.calm",
            "1.0.0",
            1,
            "https://*.example.com/*",
        ));
        let (before, _, _) = published(&fixture);
        let later = NOW + 20 * 24 * 60 * 60;
        let issued =
            republish(&fixture.store, &fixture.signer, IndexTrust::Verified, later).unwrap();
        let (after, _, _) = published(&fixture);
        assert_eq!(issued.sequence, before.sequence + 1);
        assert_eq!(after.sequence, before.sequence + 1);
        assert_eq!(after.issued_at, later);
        assert_eq!(after.expires_at, later + VALIDITY_SECONDS);
        assert_eq!(after.recipes, before.recipes);
    }

    #[test]
    fn republishing_works_after_the_index_has_expired() {
        let fixture = Fixture::new();
        fixture.publish(&recipe_json(
            "market.calm",
            "1.0.0",
            1,
            "https://*.example.com/*",
        ));
        let much_later = NOW + 90 * 24 * 60 * 60;
        assert!(
            republish(
                &fixture.store,
                &fixture.signer,
                IndexTrust::Verified,
                much_later
            )
            .is_ok()
        );
    }

    #[test]
    fn an_interrupted_publish_is_recoverable_only_by_explicit_consent() {
        let fixture = Fixture::new();
        fixture.publish(&recipe_json(
            "market.calm",
            "1.0.0",
            1,
            "https://*.example.com/*",
        ));
        let (mut index, _, _) = published(&fixture);
        reissue(&mut index, &fixture.signer, NOW + 5);
        let signed = fixture.signer.sign(&index).unwrap();
        fixture.store.insert_object(INDEX_KEY, &signed.bytes);

        assert!(matches!(
            republish(
                &fixture.store,
                &fixture.signer,
                IndexTrust::Verified,
                NOW + 6
            ),
            Err(Error::Refused(_))
        ));
        let issued = republish(
            &fixture.store,
            &fixture.signer,
            IndexTrust::AcceptUnsigned,
            NOW + 6,
        )
        .unwrap();
        assert_eq!(issued.sequence, index.sequence + 1);
        let (after, _, _) = published(&fixture);
        assert_eq!(after.sequence, issued.sequence);
    }

    #[test]
    fn a_catalog_that_does_not_exist_yet_cannot_be_republished_or_revoked() {
        let fixture = Fixture::new();
        assert!(matches!(
            republish(&fixture.store, &fixture.signer, IndexTrust::Verified, NOW),
            Err(Error::NotFound(_))
        ));
    }

    #[test]
    fn another_signers_catalog_is_refused() {
        let fixture = Fixture::new();
        fixture.publish(&recipe_json(
            "market.calm",
            "1.0.0",
            1,
            "https://*.example.com/*",
        ));
        let stranger = crate::key::tests::test_signer();
        assert!(matches!(
            republish(&fixture.store, &stranger, IndexTrust::Verified, NOW),
            Err(Error::Refused(_))
        ));
    }
}
