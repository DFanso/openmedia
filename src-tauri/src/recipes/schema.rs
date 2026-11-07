use std::collections::{BTreeMap, HashSet};

use serde::{Deserialize, Serialize};

use super::matcher::Matcher;
use super::selector::{validate_declarations, validate_selector};
use crate::error::{Error, Result};

pub const SCHEMA_VERSION: u32 = 1;
const MAX_RULES: usize = 200;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Origin {
    Bundled,
    User,
    Ai,
    Imported,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Meta {
    pub author: Option<String>,
    pub last_verified: Option<String>,
    pub notes: Option<String>,
}

/// Only a CSS selector for now. The wiki's semantic fields (aria-label, href, text) are refused,
/// not silently ignored, until the engine supports them.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Target {
    pub css: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub enum Rule {
    Hide {
        id: String,
        label: String,
        target: Target,
    },
    Css {
        id: String,
        label: String,
        target: Target,
        declarations: BTreeMap<String, String>,
    },
}

impl Rule {
    pub fn id(&self) -> &str {
        match self {
            Self::Hide { id, .. } | Self::Css { id, .. } => id,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Recipe {
    pub schema: u32,
    pub id: String,
    pub name: String,
    pub version: String,
    pub origin: Origin,
    #[serde(rename = "match")]
    pub matches: Vec<String>,
    pub rules: Vec<Rule>,
    pub meta: Option<Meta>,
}

impl Recipe {
    pub fn parse(json: &str) -> Result<Self> {
        let recipe: Self = serde_json::from_str(json).map_err(|e| Error::Recipe(e.to_string()))?;
        recipe.validate()?;
        Ok(recipe)
    }

    fn validate(&self) -> Result<()> {
        if self.schema != SCHEMA_VERSION {
            return Err(Error::Recipe(format!(
                "recipe {} uses unsupported schema {}",
                self.id, self.schema
            )));
        }
        if self.id.trim().is_empty() || self.name.trim().is_empty() {
            return Err(Error::Recipe("a recipe needs an id and a name".into()));
        }
        if self.matches.is_empty() {
            return Err(Error::Recipe(format!(
                "recipe {} matches no pages",
                self.id
            )));
        }
        if self.rules.len() > MAX_RULES {
            return Err(Error::Recipe(format!(
                "recipe {} has too many rules",
                self.id
            )));
        }
        for pattern in &self.matches {
            let matcher = Matcher::parse(pattern)?;
            if matcher.is_broad() && self.origin != Origin::Bundled {
                return Err(Error::Recipe(format!(
                    "match pattern {pattern} is too broad"
                )));
            }
        }
        let mut seen = HashSet::new();
        for rule in &self.rules {
            if !seen.insert(rule.id()) {
                return Err(Error::Recipe(format!("duplicate rule id {}", rule.id())));
            }
            match rule {
                Rule::Hide { target, .. } => validate_selector(&target.css)?,
                Rule::Css {
                    target,
                    declarations,
                    ..
                } => {
                    validate_selector(&target.css)?;
                    validate_declarations(declarations)?;
                }
            }
        }
        Ok(())
    }
}
