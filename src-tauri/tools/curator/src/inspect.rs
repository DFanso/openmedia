//! Loading a pending submission the way the device will see it, and the plain-text review the
//! curator reads before approving. The pending body is written by the Worker (untrusted), so it
//! is re-validated here with the same function the app runs on a download.

use std::fmt::Write;

use openmedia_lib::{
    catalog::index::Index,
    recipes::{self, Recipe},
};
use serde::Deserialize;

use crate::error::{Error, Result};
use crate::ids::{RecipeId, SubmissionId, Version, printable};
use crate::publish::read_index_unverified;
use crate::store::{Store, pending_key, recipe_key};

const MAX_SUMMARY_CHARS: usize = 140;
const SHORT_HOST_CHARS: usize = 6;
const SUFFIX_LIKE_LABELS: [&str; 10] = [
    "co", "com", "org", "net", "gov", "edu", "ac", "or", "ne", "go",
];

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Body {
    recipe: serde_json::Value,
    summary: String,
}

pub struct Pending {
    pub recipe: Recipe,
    pub recipe_id: RecipeId,
    pub version: Version,
    pub summary: String,
}

fn summary_problem(summary: &str) -> Option<&'static str> {
    if summary.trim().is_empty() {
        Some("the summary is empty")
    } else if summary.chars().count() > MAX_SUMMARY_CHARS {
        Some("the summary is longer than 140 characters")
    } else if summary.chars().any(is_unsafe_char) {
        Some("the summary contains control or direction-override characters")
    } else {
        None
    }
}

fn is_unsafe_char(c: char) -> bool {
    c.is_control()
        || matches!(c, '\u{200B}'..='\u{200F}' | '\u{202A}'..='\u{202E}' | '\u{2066}'..='\u{2069}' | '\u{FEFF}')
}

pub fn load_pending(store: &dyn Store, id: &SubmissionId) -> Result<Pending> {
    let row = store
        .submission(id)?
        .ok_or_else(|| Error::NotFound(format!("submission {id} is not in the database")))?;
    if row.status != "pending" {
        return Err(Error::Refused(format!(
            "submission {id} is already {}",
            printable(&row.status)
        )));
    }
    let bytes = store
        .get_object(&pending_key(id))?
        .ok_or_else(|| Error::NotFound(format!("pending/{id}.json is not in the bucket")))?;
    let body: Body = serde_json::from_slice(&bytes)
        .map_err(|error| Error::Validation(format!("the pending body is not valid: {error}")))?;
    let recipe = recipes::parse_catalog_recipe(&serde_json::to_vec(&body.recipe)?)
        .map_err(|error| Error::Validation(error.to_string()))?;
    if recipe.id != row.recipe_id || recipe.version != row.version {
        return Err(Error::Validation(format!(
            "the body holds {} {} but the database row says {} {}",
            printable(&recipe.id),
            printable(&recipe.version),
            printable(&row.recipe_id),
            printable(&row.version)
        )));
    }
    if let Some(problem) = summary_problem(&body.summary) {
        return Err(Error::Validation(problem.into()));
    }
    Ok(Pending {
        recipe_id: RecipeId::parse(&recipe.id)?,
        version: Version::parse(&recipe.version)?,
        summary: body.summary,
        recipe,
    })
}

struct Published {
    version: String,
    rules: Option<usize>,
}

fn published_context(store: &dyn Store, pending: &Pending) -> Result<(Option<Published>, bool)> {
    let index: Option<Index> = read_index_unverified(store).ok().flatten();
    let published = match index.as_ref().and_then(|index| {
        index
            .recipes
            .iter()
            .find(|entry| entry.id == pending.recipe.id)
    }) {
        Some(entry) => Some(Published {
            version: entry.version.clone(),
            rules: published_rule_count(store, &pending.recipe_id, &entry.version)?,
        }),
        None => None,
    };
    let exists = store
        .get_object(&recipe_key(&pending.recipe_id, &pending.version))?
        .is_some();
    Ok((published, exists))
}

fn published_rule_count(store: &dyn Store, id: &RecipeId, version: &str) -> Result<Option<usize>> {
    let Ok(version) = Version::parse(version) else {
        return Ok(None);
    };
    let bytes = store.get_object(&recipe_key(id, &version))?;
    Ok(bytes
        .and_then(|bytes| recipes::parse_catalog_recipe(&bytes).ok())
        .map(|recipe| recipe.rules.len()))
}

fn host_of(pattern: &str) -> Option<&str> {
    pattern.split_once("://")?.1.split('/').next()
}

/// The registrable-looking part of a pattern's host, as listed in the catalog entry.
pub fn listed_host(pattern: &str) -> Option<String> {
    let host = host_of(pattern)?;
    Some(host.strip_prefix("*.").unwrap_or(host).to_lowercase())
}

fn host_warning(pattern: &str) -> Option<String> {
    let host = listed_host(pattern)?;
    let labels: Vec<&str> = host.split('.').collect();
    let reason = if host == "*" {
        "matches every site"
    } else if labels.len() == 1 {
        "is a single label (a bare TLD or local name)"
    } else if labels.len() == 2 && SUFFIX_LIKE_LABELS.contains(&labels[0]) {
        "looks like a public suffix, not one site"
    } else if host.len() < SHORT_HOST_CHARS {
        "is a very short host"
    } else {
        return None;
    };
    Some(format!(
        "match pattern {} {reason}: check this recipe is not meant to reach far more sites than it names",
        printable(pattern)
    ))
}

fn warnings(pending: &Pending, published: Option<&Published>, exists: bool) -> Vec<String> {
    let mut found: Vec<String> = pending
        .recipe
        .matches
        .iter()
        .filter_map(|p| host_warning(p))
        .collect();
    if let Some(published) = published {
        found.push(version_warning(pending, published));
    }
    if exists {
        found.push(format!(
            "recipes/{}/{}.json already exists in the bucket: approve will refuse (versions are immutable)",
            pending.recipe_id, pending.version
        ));
    }
    found
}

fn version_warning(pending: &Pending, published: &Published) -> String {
    let newer = Version::parse(&published.version)
        .map(|old| pending.version.is_newer_than(&old))
        .unwrap_or(false);
    let rules = match published.rules {
        Some(old) => format!(
            "rules: {old} -> {} ({:+})",
            pending.recipe.rules.len(),
            pending.recipe.rules.len() as i64 - old as i64
        ),
        None => format!(
            "rules: ? -> {} (published file unreadable)",
            pending.recipe.rules.len()
        ),
    };
    let verdict = if newer {
        ""
    } else {
        "; NOT newer, approve will refuse"
    };
    format!(
        "{} is already published at {}; this is {} ({rules}){verdict}",
        pending.recipe_id,
        printable(&published.version),
        pending.version
    )
}

pub struct Review {
    pub text: String,
    pub warnings: usize,
}

pub fn review(store: &dyn Store, id: &SubmissionId) -> Result<Review> {
    let pending = load_pending(store, id)?;
    let (published, exists) = published_context(store, &pending)?;
    let warnings = warnings(&pending, published.as_ref(), exists);
    let preview = recipes::preview_recipe(
        &pending.recipe,
        published
            .as_ref()
            .map(|published| published.version.as_str()),
    );
    let mut text = String::new();
    write_warnings(&mut text, &warnings);
    // Writing into a String cannot fail.
    let _ = write_preview(&mut text, id, &pending, &preview);
    Ok(Review {
        text,
        warnings: warnings.len(),
    })
}

fn write_warnings(text: &mut String, warnings: &[String]) {
    if warnings.is_empty() {
        return;
    }
    let _ = writeln!(
        text,
        "!!! {} WARNING(S): read before approving",
        warnings.len()
    );
    for warning in warnings {
        let _ = writeln!(text, "!!! WARNING: {warning}");
    }
    text.push('\n');
}

fn write_preview(
    text: &mut String,
    id: &SubmissionId,
    pending: &Pending,
    preview: &recipes::RecipePreview,
) -> std::fmt::Result {
    writeln!(text, "Submission: {id}")?;
    writeln!(
        text,
        "Recipe:     {} (version {})",
        preview.id, preview.version
    )?;
    writeln!(text, "Name:       {}", preview.name)?;
    writeln!(
        text,
        "Author:     {}",
        preview.author.as_deref().unwrap_or("(none)")
    )?;
    writeln!(text, "Summary:    {}", pending.summary)?;
    if let Some(notes) = &preview.notes {
        writeln!(text, "Notes:      {notes}")?;
    }
    if let Some(replaces) = &preview.replaces {
        writeln!(text, "Replaces:   published version {replaces}")?;
    }
    writeln!(text, "\nSites ({} match patterns):", preview.sites.len())?;
    for site in &preview.sites {
        writeln!(text, "  - {site}")?;
    }
    writeln!(text, "\nOptions ({}):", preview.options.len())?;
    for option in &preview.options {
        let state = if option.on_by_default { "on" } else { "off" };
        writeln!(
            text,
            "  - [{state} by default] {}: {}",
            option.label, option.description
        )?;
    }
    writeln!(text, "\nRules ({}):", preview.rules.len())?;
    for (number, rule) in preview.rules.iter().enumerate() {
        writeln!(text, "  {}. [{}] {}", number + 1, rule.kind, rule.label)?;
        writeln!(text, "       selector: {}", rule.selector)?;
        if !rule.declarations.is_empty() {
            let declarations: Vec<String> = rule
                .declarations
                .iter()
                .map(|(property, value)| format!("{property}: {value}"))
                .collect();
            writeln!(text, "       declarations: {}", declarations.join("; "))?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::*;

    #[test]
    fn the_review_lists_every_rule_and_pattern() {
        let fixture = Fixture::new();
        let id = fixture.submit(&recipe_json(
            "market.calm",
            "1.0.0",
            3,
            "https://*.example.com/*",
        ));
        let review = review(&fixture.store, &id).unwrap();
        assert_eq!(review.warnings, 0);
        for needle in [
            "market.calm",
            "https://*.example.com/*",
            "Quieter pages",
            "r0",
            "r1",
            "r2",
            "[css]",
            "display: none",
            "selector: .x0",
        ] {
            assert!(review.text.contains(needle), "{needle}\n{}", review.text);
        }
    }

    #[test]
    fn short_hosts_and_bare_wildcards_are_flagged_loudly() {
        let fixture = Fixture::new();
        for pattern in [
            "https://*.co.uk/*",
            "https://*.com/*",
            "https://x.io/*",
            "https://*.localhost/*",
        ] {
            let id = fixture.submit(&recipe_json("market.calm", "1.0.0", 1, pattern));
            let review = review(&fixture.store, &id).unwrap();
            assert_eq!(review.warnings, 1, "{pattern}");
            assert!(review.text.contains("!!! WARNING"), "{pattern}");
        }
    }

    #[test]
    fn an_already_published_id_shows_the_version_and_rule_change() {
        let fixture = Fixture::new();
        fixture.publish(&recipe_json(
            "market.calm",
            "1.0.0",
            2,
            "https://*.example.com/*",
        ));
        let id = fixture.submit(&recipe_json(
            "market.calm",
            "1.1.0",
            5,
            "https://*.example.com/*",
        ));
        let review = review(&fixture.store, &id).unwrap();
        assert!(
            review.text.contains("already published at 1.0.0"),
            "{}",
            review.text
        );
        assert!(
            review.text.contains("rules: 2 -> 5 (+3)"),
            "{}",
            review.text
        );
        assert!(review.text.contains("Replaces:   published version 1.0.0"));
    }

    #[test]
    fn an_invalid_submission_is_an_error_not_a_review() {
        let fixture = Fixture::new();
        let script = recipe_json("market.calm", "1.0.0", 1, "https://*.example.com/*")
            .replace(r#""type":"css""#, r#""type":"script""#);
        let id = fixture.submit(&script);
        assert!(matches!(
            review(&fixture.store, &id),
            Err(Error::Validation(_))
        ));
    }

    #[test]
    fn a_body_that_disagrees_with_the_database_row_is_refused() {
        let fixture = Fixture::new();
        let id = fixture.submit_with_row(
            &recipe_json("market.other", "1.0.0", 1, "https://*.example.com/*"),
            "market.calm",
            "1.0.0",
        );
        assert!(matches!(
            review(&fixture.store, &id),
            Err(Error::Validation(_))
        ));
    }
}
