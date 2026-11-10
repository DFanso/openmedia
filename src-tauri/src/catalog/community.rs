//! Ratings and comments: the shapes the Worker sends, and the identities the device derives. The
//! device token is random and lives in `catalog-state.json`; the commenter id is derived from the
//! Pro identity exactly as the Worker derives it, so the app can recognise its own comments and
//! block other commenters without the Worker ever sending an identity hash.

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ring::rand::{SecureRandom, SystemRandom};
use serde::{Deserialize, Serialize};

use super::index::sha256_hex;
use crate::error::{Error, Result};
use crate::recipes;

pub const DEVICE_TOKEN_BYTES: usize = 32;
/// 32 bytes in unpadded base64url.
pub const DEVICE_TOKEN_CHARS: usize = 43;
pub const COMMENTER_CHARS: usize = 10;
pub const MIN_STARS: u8 = 1;
pub const MAX_STARS: u8 = 5;
const MAX_COMMENTS: usize = 50;
const MAX_COMMENT_CHARS: usize = 280;
const COMMENT_ID_CHARS: usize = 36;

/// A fresh device token: 32 random bytes, base64url without padding.
pub fn new_device_token() -> Result<String> {
    let mut bytes = [0_u8; DEVICE_TOKEN_BYTES];
    SystemRandom::new()
        .fill(&mut bytes)
        .map_err(|_| Error::Catalog("could not create a device token".into()))?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

/// Whether `token` has the shape of a device token the Worker accepts.
pub fn is_device_token(token: &str) -> bool {
    token.len() == DEVICE_TOKEN_CHARS
        && token
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        && URL_SAFE_NO_PAD
            .decode(token)
            .is_ok_and(|bytes| bytes.len() == DEVICE_TOKEN_BYTES)
}

/// The Worker's identity for a Pro user: `sha256(app user id)` in hex.
fn identity_hash(app_user_id: &str) -> String {
    sha256_hex(app_user_id.as_bytes())
}

/// The first 10 hex characters of `sha256("commenter:" + identityHash)`. Stable across recipes.
pub fn commenter_of(app_user_id: &str) -> String {
    let digest = sha256_hex(format!("commenter:{}", identity_hash(app_user_id)).as_bytes());
    digest[..COMMENTER_CHARS].to_owned()
}

pub fn is_commenter_id(text: &str) -> bool {
    text.len() == COMMENTER_CHARS
        && text
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

pub fn is_comment_id(text: &str) -> bool {
    text.len() == COMMENT_ID_CHARS
        && text.char_indices().all(|(index, c)| match index {
            8 | 13 | 18 | 23 => c == '-',
            _ => c.is_ascii_digit() || ('a'..='f').contains(&c),
        })
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RatingSummary {
    pub average: Option<f64>,
    pub count: u64,
}

#[derive(Debug, Deserialize)]
pub struct RatingsReply {
    pub ratings: std::collections::BTreeMap<String, RatingSummary>,
}

/// A comment as the Worker lists it.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct WireComment {
    pub id: String,
    pub commenter: String,
    pub text: String,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct CommentsReply {
    pub comments: Vec<WireComment>,
}

/// A comment as the shell shows it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Comment {
    pub id: String,
    pub commenter: String,
    pub text: String,
    pub created_at: i64,
    pub mine: bool,
}

#[derive(Debug, Serialize)]
pub struct Comments {
    pub comments: Vec<Comment>,
}

/// Checks the Worker's answer (it is untrusted text), drops blocked commenters, and marks the
/// device's own comments.
pub fn visible_comments(
    wire: Vec<WireComment>,
    blocked: &[String],
    own_commenter: Option<&str>,
) -> Result<Vec<Comment>> {
    if wire.len() > MAX_COMMENTS {
        return Err(Error::Catalog(
            "the marketplace answered unexpectedly".into(),
        ));
    }
    let mut comments = Vec::new();
    for comment in wire {
        let well_formed = is_comment_id(&comment.id)
            && is_commenter_id(&comment.commenter)
            && !comment.text.trim().is_empty()
            && recipes::is_plain_text(&comment.text, MAX_COMMENT_CHARS);
        if !well_formed {
            return Err(Error::Catalog(
                "the marketplace answered unexpectedly".into(),
            ));
        }
        if blocked.contains(&comment.commenter) {
            continue;
        }
        comments.push(Comment {
            mine: own_commenter == Some(comment.commenter.as_str()),
            id: comment.id,
            commenter: comment.commenter,
            text: comment.text,
            created_at: comment.created_at,
        });
    }
    Ok(comments)
}

#[cfg(test)]
mod tests {
    use super::*;

    const ID: &str = "123e4567-e89b-12d3-a456-426614174000";

    fn wire(commenter: &str, text: &str) -> WireComment {
        WireComment {
            id: ID.into(),
            commenter: commenter.into(),
            text: text.into(),
            created_at: 5,
        }
    }

    #[test]
    fn a_device_token_is_43_base64url_characters_of_32_random_bytes() {
        let one = new_device_token().unwrap();
        let two = new_device_token().unwrap();
        assert_eq!(one.len(), DEVICE_TOKEN_CHARS);
        assert!(is_device_token(&one));
        assert_ne!(one, two);
        for bad in [
            "",
            &"a".repeat(42),
            &"a".repeat(44),
            &format!("{}=", "a".repeat(42)),
            &format!("{}+", "a".repeat(42)),
        ] {
            assert!(!is_device_token(bad), "{bad}");
        }
    }

    #[test]
    fn the_commenter_id_is_derived_like_the_worker_does() {
        let user = "$RCAnonymousID:0123456789abcdef";
        let expected = sha256_hex(format!("commenter:{}", sha256_hex(user.as_bytes())).as_bytes());
        let commenter = commenter_of(user);
        assert_eq!(commenter, expected[..10]);
        assert!(is_commenter_id(&commenter));
        assert_ne!(commenter, commenter_of("$RCAnonymousID:fedcba9876543210"));
    }

    #[test]
    fn ids_have_a_strict_shape() {
        assert!(is_commenter_id("0123456abc"));
        for bad in ["", "0123456AB", "0123456abcd", "zzzzzzzzzz", "../../abcd"] {
            assert!(!is_commenter_id(bad), "{bad}");
        }
        assert!(is_comment_id(ID));
        assert!(!is_comment_id("123e4567e89b12d3a456426614174000"));
        assert!(!is_comment_id("../comments/x"));
    }

    #[test]
    fn blocked_commenters_are_filtered_and_own_comments_marked() {
        let comments = visible_comments(
            vec![
                wire("aaaaaaaaaa", "one"),
                wire("bbbbbbbbbb", "two"),
                wire("cccccccccc", "three"),
            ],
            &["bbbbbbbbbb".to_owned()],
            Some("cccccccccc"),
        )
        .unwrap();
        let shown: Vec<_> = comments.iter().map(|c| (c.text.as_str(), c.mine)).collect();
        assert_eq!(shown, [("one", false), ("three", true)]);
    }

    #[test]
    fn without_an_identity_no_comment_is_mine() {
        let comments = visible_comments(vec![wire("aaaaaaaaaa", "one")], &[], None).unwrap();
        assert!(!comments[0].mine);
    }

    #[test]
    fn a_malformed_comment_list_is_refused() {
        assert!(visible_comments(vec![wire("short", "x")], &[], None).is_err());
        assert!(visible_comments(vec![wire("aaaaaaaaaa", "Ca\u{202E}t")], &[], None).is_err());
        assert!(visible_comments(vec![wire("aaaaaaaaaa", " ")], &[], None).is_err());
        let many = (0..51).map(|_| wire("aaaaaaaaaa", "x")).collect();
        assert!(visible_comments(many, &[], None).is_err());
    }
}
