//! Every identifier that reaches a wrangler argument or a SQL string is parsed here first, so the
//! only text ever interpolated is text this module has proven to be plain hex, digits, letters,
//! dots and dashes.

use std::fmt;

use crate::error::{Error, Result};

const MARKET_PREFIX: &str = "market.";
const MAX_RECIPE_ID_CHARS: usize = 80;
const MAX_VERSION_PART_DIGITS: usize = 4;
const UUID_GROUPS: [usize; 5] = [8, 4, 4, 4, 12];
const SHA256_HEX_CHARS: usize = 64;
const MAX_KEY_ID_CHARS: usize = 32;
const MAX_SHOWN_CHARS: usize = 120;

fn invalid(kind: &str, text: &str) -> Error {
    let shown: String = text.chars().take(MAX_SHOWN_CHARS).collect();
    Error::InvalidInput(format!("{kind} is malformed: {}", printable(&shown)))
}

/// Renders untrusted text for a terminal without letting it carry escape sequences.
pub fn printable(text: &str) -> String {
    text.chars()
        .map(|c| if c.is_control() { '\u{fffd}' } else { c })
        .collect()
}

fn is_lower_hex(text: &str) -> bool {
    text.bytes()
        .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SubmissionId(String);

impl SubmissionId {
    pub fn parse(text: &str) -> Result<Self> {
        let groups: Vec<&str> = text.split('-').collect();
        let well_formed = groups.len() == UUID_GROUPS.len()
            && groups
                .iter()
                .zip(UUID_GROUPS)
                .all(|(group, len)| group.len() == len && is_lower_hex(group));
        if well_formed {
            Ok(Self(text.to_owned()))
        } else {
            Err(invalid("submission id", text))
        }
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for SubmissionId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RecipeId(String);

impl RecipeId {
    pub fn parse(text: &str) -> Result<Self> {
        let well_formed = text.len() <= MAX_RECIPE_ID_CHARS
            && text.strip_prefix(MARKET_PREFIX).is_some_and(|rest| {
                rest.starts_with(|c: char| c.is_ascii_lowercase() || c.is_ascii_digit())
                    && rest.chars().all(|c| {
                        c.is_ascii_lowercase() || c.is_ascii_digit() || c == '.' || c == '-'
                    })
            });
        if well_formed {
            Ok(Self(text.to_owned()))
        } else {
            Err(invalid("recipe id", text))
        }
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for RecipeId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

/// `MAJOR.MINOR.PATCH`, compared numerically.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Version {
    text: String,
    parts: [u32; 3],
}

impl Version {
    pub fn parse(text: &str) -> Result<Self> {
        let numbers: Vec<u32> = text
            .split('.')
            .map(|part| {
                (!part.is_empty()
                    && part.len() <= MAX_VERSION_PART_DIGITS
                    && part.bytes().all(|b| b.is_ascii_digit()))
                .then(|| part.parse().ok())
                .flatten()
            })
            .collect::<Option<_>>()
            .ok_or_else(|| invalid("version", text))?;
        let parts = <[u32; 3]>::try_from(numbers).map_err(|_| invalid("version", text))?;
        Ok(Self {
            text: text.to_owned(),
            parts,
        })
    }

    pub fn as_str(&self) -> &str {
        &self.text
    }

    pub fn is_newer_than(&self, other: &Self) -> bool {
        self.parts > other.parts
    }
}

impl fmt::Display for Version {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.text)
    }
}

pub fn parse_sha256(text: &str) -> Result<String> {
    if text.len() == SHA256_HEX_CHARS && is_lower_hex(text) {
        Ok(text.to_owned())
    } else {
        Err(invalid("sha256", text))
    }
}

/// A key id travels inside `OPENMEDIA_CATALOG_KEYS=id:base64,id:base64`, so it cannot hold `:`
/// or `,`.
pub fn parse_key_id(text: &str) -> Result<String> {
    let well_formed = !text.is_empty()
        && text.len() <= MAX_KEY_ID_CHARS
        && text
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if well_formed {
        Ok(text.to_owned())
    } else {
        Err(invalid("key id", text))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const UUID: &str = "0b9a4d3e-7c21-4f5a-9d10-2c3b4a5d6e7f";

    #[test]
    fn well_formed_ids_parse() {
        assert_eq!(SubmissionId::parse(UUID).unwrap().as_str(), UUID);
        assert!(RecipeId::parse("market.youtube-calm").is_ok());
        assert!(RecipeId::parse("market.a.b-2").is_ok());
        assert!(Version::parse("1.20.300").is_ok());
        assert!(parse_sha256(&"ab".repeat(32)).is_ok());
        assert!(parse_key_id("k1").is_ok());
    }

    #[test]
    fn injection_shaped_text_is_refused_everywhere() {
        let sql = "x' OR '1'='1";
        let drop = format!("{UUID}'; DROP TABLE submissions;--");
        for text in [
            sql,
            drop.as_str(),
            "",
            "../../etc/passwd",
            UUID.to_uppercase().as_str(),
        ] {
            assert!(SubmissionId::parse(text).is_err(), "{text}");
        }
        for text in [
            "market.x'; DROP TABLE reports;--",
            "market.",
            "market.A",
            "market.a b",
            "calm",
            "market.a/../b",
            "market.-a",
        ] {
            assert!(RecipeId::parse(text).is_err(), "{text}");
        }
        for text in [
            "1.0",
            "1.0.0'",
            "1.0.0.0",
            "a.b.c",
            "1..0",
            "99999.0.0",
            "-1.0.0",
        ] {
            assert!(Version::parse(text).is_err(), "{text}");
        }
        assert!(parse_sha256("AB").is_err());
        assert!(parse_sha256(&"G".repeat(64)).is_err());
        assert!(parse_key_id("k1:evil").is_err());
        assert!(parse_key_id("a,b").is_err());
    }

    #[test]
    fn versions_compare_numerically() {
        let v = |text| Version::parse(text).unwrap();
        assert!(v("1.10.0").is_newer_than(&v("1.9.9")));
        assert!(!v("1.0.0").is_newer_than(&v("1.0.0")));
        assert!(!v("1.01.0").is_newer_than(&v("1.1.0")));
        assert!(!v("0.9.0").is_newer_than(&v("1.0.0")));
    }

    #[test]
    fn terminal_text_loses_control_characters() {
        assert_eq!(printable("a\u{1b}[31mb"), "a\u{fffd}[31mb");
    }
}
