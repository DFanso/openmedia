use std::collections::{BTreeMap, HashSet};

use serde::{Deserialize, Serialize};
use url::Url;

use super::matcher::Matcher;
use super::selector::{validate_declarations, validate_selector};
use crate::error::{Error, Result};

pub const SCHEMA_VERSION: u32 = 1;
const MAX_RULES: usize = 200;
const MAX_OPTIONS: usize = 30;
const MAX_LABEL_CHARS: usize = 60;
const MAX_DESCRIPTION_CHARS: usize = 160;

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
    /// Where "add to favorites" sends the user; also what a favorite of this site opens.
    pub homepage: Option<String>,
    pub last_verified: Option<String>,
    pub notes: Option<String>,
}

/// Annoyances (install nags, scroll locks, promo bars) are meant to be hidden by default;
/// content (Reels, Shorts, suggested posts) is the user's choice and starts visible. The group
/// only orders and labels the toggles; the default is set per option.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OptionGroup {
    Annoyance,
    Content,
}

/// A user-facing toggle. Rules point at an option with their `option` field; the toggle turns all
/// of them on or off together.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct SiteOption {
    pub id: String,
    pub label: String,
    pub description: String,
    pub group: OptionGroup,
    /// Whether the rules apply until the user chooses otherwise.
    #[serde(rename = "default")]
    pub enabled_by_default: bool,
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
        #[serde(default, skip_serializing_if = "Option::is_none")]
        option: Option<String>,
        target: Target,
    },
    Css {
        id: String,
        label: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        option: Option<String>,
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

    /// The toggle this rule belongs to; a rule with none always applies.
    pub fn option(&self) -> Option<&str> {
        match self {
            Self::Hide { option, .. } | Self::Css { option, .. } => option.as_deref(),
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
    #[serde(default)]
    pub options: Vec<SiteOption>,
    pub rules: Vec<Rule>,
    pub meta: Option<Meta>,
}

impl Recipe {
    pub fn parse(json: &str) -> Result<Self> {
        let recipe: Self = serde_json::from_str(json).map_err(|e| Error::Recipe(e.to_string()))?;
        recipe.validate()?;
        Ok(recipe)
    }

    pub fn homepage(&self) -> Option<&str> {
        self.meta.as_ref()?.homepage.as_deref()
    }

    pub fn option(&self, id: &str) -> Option<&SiteOption> {
        self.options.iter().find(|option| option.id == id)
    }

    /// Whether a rule applies, given the user's saved choices for this recipe's options.
    pub fn rule_applies(&self, rule: &Rule, choices: Option<&BTreeMap<String, bool>>) -> bool {
        let Some(option) = rule.option().and_then(|id| self.option(id)) else {
            return true;
        };
        choices
            .and_then(|saved| saved.get(&option.id))
            .copied()
            .unwrap_or(option.enabled_by_default)
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
        self.validate_options()?;
        self.validate_homepage()?;
        let mut seen = HashSet::new();
        for rule in &self.rules {
            if !seen.insert(rule.id()) {
                return Err(Error::Recipe(format!("duplicate rule id {}", rule.id())));
            }
            if let Some(option) = rule.option()
                && self.option(option).is_none()
            {
                return Err(Error::Recipe(format!(
                    "rule {} uses unknown option {option}",
                    rule.id()
                )));
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

    fn validate_homepage(&self) -> Result<()> {
        let Some(homepage) = self.homepage() else {
            return Ok(());
        };
        match Url::parse(homepage) {
            Ok(url) if matches!(url.scheme(), "http" | "https") && url.host_str().is_some() => {
                Ok(())
            }
            _ => Err(Error::Recipe(format!(
                "recipe {} has an invalid homepage",
                self.id
            ))),
        }
    }

    fn validate_options(&self) -> Result<()> {
        if self.options.len() > MAX_OPTIONS {
            return Err(Error::Recipe(format!(
                "recipe {} has too many options",
                self.id
            )));
        }
        let mut seen = HashSet::new();
        for option in &self.options {
            let well_formed = !option.id.is_empty()
                && option
                    .id
                    .chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
                && !option.label.trim().is_empty()
                && option.label.chars().count() <= MAX_LABEL_CHARS
                && option.description.chars().count() <= MAX_DESCRIPTION_CHARS;
            if !well_formed || !seen.insert(option.id.as_str()) {
                return Err(Error::Recipe(format!("option {} is invalid", option.id)));
            }
            if !self
                .rules
                .iter()
                .any(|rule| rule.option() == Some(option.id.as_str()))
            {
                return Err(Error::Recipe(format!("option {} has no rules", option.id)));
            }
        }
        Ok(())
    }
}
