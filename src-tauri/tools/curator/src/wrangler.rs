//! `Store` over the `wrangler` CLI. Every call passes an argument array (never a shell string);
//! SQL is built only from ids that `ids` has already proven to be plain text.

use std::{
    io::ErrorKind,
    path::PathBuf,
    process::{Command, Output, Stdio},
};

use serde_json::{Map, Value};

use crate::error::{Error, Result};
use crate::ids::SubmissionId;
use crate::store::{ReportCount, Status, Store, SubmissionRow};

const MAX_DETAIL_CHARS: usize = 600;

pub struct WranglerStore {
    program: String,
    worker_dir: PathBuf,
    bucket: String,
    database: String,
}

impl WranglerStore {
    pub fn new(program: String, worker_dir: PathBuf, bucket: String, database: String) -> Self {
        Self {
            program,
            worker_dir,
            bucket,
            database,
        }
    }

    fn run(&self, args: &[&str]) -> Result<Output> {
        Command::new(&self.program)
            .args(args)
            .current_dir(&self.worker_dir)
            .stdin(Stdio::null())
            .output()
            .map_err(|error| match error.kind() {
                ErrorKind::NotFound => Error::WranglerMissing(self.program.clone()),
                _ => Error::Io(error),
            })
    }

    fn run_checked(&self, args: &[&str]) -> Result<Output> {
        let output = self.run(args)?;
        if output.status.success() {
            Ok(output)
        } else {
            Err(failure(args, &output))
        }
    }

    fn object_path(&self, key: &str) -> Result<String> {
        check_key(key)?;
        Ok(format!("{}/{key}", self.bucket))
    }

    fn d1(&self, sql: &str, write: bool) -> Result<D1Result> {
        let mut args = vec![
            "d1",
            "execute",
            self.database.as_str(),
            "--remote",
            "--json",
            "--command",
            sql,
        ];
        if write {
            args.push("--yes");
        }
        let output = self.run_checked(&args)?;
        parse_d1(&String::from_utf8_lossy(&output.stdout))
    }
}

fn check_key(key: &str) -> Result<()> {
    let well_formed = !key.is_empty()
        && !key.starts_with('/')
        && key
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || "._/-".contains(c));
    if well_formed {
        Ok(())
    } else {
        Err(Error::InvalidInput(format!(
            "object key is malformed: {key:?}"
        )))
    }
}

fn content_type(key: &str) -> &'static str {
    if key.ends_with(".sig") {
        "text/plain"
    } else {
        "application/json"
    }
}

fn failure(args: &[&str], output: &Output) -> Error {
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let text = format!("{stderr}\n{stdout}");
    if looks_unauthenticated(&text) {
        return Error::WranglerAuth;
    }
    let command = args.iter().take(3).copied().collect::<Vec<_>>().join(" ");
    let detail: String = stderr
        .trim()
        .chars()
        .filter(|c| !c.is_control() || *c == '\n')
        .take(MAX_DETAIL_CHARS)
        .collect();
    Error::Wrangler { command, detail }
}

fn looks_unauthenticated(text: &str) -> bool {
    let text = text.to_lowercase();
    [
        "not logged in",
        "not authenticated",
        "wrangler login",
        "cloudflare_api_token",
        "[code: 10000]",
        "authentication error",
    ]
    .iter()
    .any(|marker| text.contains(marker))
}

fn looks_missing(text: &str) -> bool {
    let text = text.to_lowercase();
    ["specified key does not exist", "nosuchkey", "[code: 10007]"]
        .iter()
        .any(|marker| text.contains(marker))
}

#[derive(Debug, PartialEq)]
pub struct D1Result {
    pub rows: Vec<Map<String, Value>>,
    pub changes: Option<u64>,
}

/// Reads the first value in wrangler's `--json` output. Anything printed before the first
/// top-level array (banners, update notices) is skipped; anything after is ignored.
pub fn parse_d1(stdout: &str) -> Result<D1Result> {
    let bad = |what: &str| Error::UnexpectedOutput(format!("D1 reply {what}"));
    let start = stdout
        .match_indices('[')
        .map(|(at, _)| at)
        .find(|at| *at == 0 || stdout.as_bytes()[at - 1] == b'\n')
        .ok_or_else(|| bad("has no JSON array"))?;
    let value = serde_json::Deserializer::from_str(&stdout[start..])
        .into_iter::<Value>()
        .next()
        .ok_or_else(|| bad("is empty"))?
        .map_err(|_| bad("is not valid JSON"))?;
    let statement = value
        .as_array()
        .and_then(|statements| statements.first())
        .ok_or_else(|| bad("has no statement result"))?;
    if statement.get("success").and_then(Value::as_bool) == Some(false) {
        return Err(bad("reports failure"));
    }
    let rows = statement
        .get("results")
        .and_then(Value::as_array)
        .map(|rows| {
            rows.iter()
                .filter_map(|row| row.as_object().cloned())
                .collect()
        })
        .unwrap_or_default();
    let changes = statement
        .get("meta")
        .and_then(|meta| meta.get("changes"))
        .and_then(Value::as_u64);
    Ok(D1Result { rows, changes })
}

fn text(row: &Map<String, Value>, key: &str) -> Result<String> {
    row.get(key)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| Error::UnexpectedOutput(format!("D1 row has no text column {key}")))
}

fn number(row: &Map<String, Value>, key: &str) -> Result<i64> {
    row.get(key)
        .and_then(Value::as_i64)
        .ok_or_else(|| Error::UnexpectedOutput(format!("D1 row has no integer column {key}")))
}

fn submission_row(row: &Map<String, Value>) -> Result<SubmissionRow> {
    Ok(SubmissionRow {
        id: text(row, "id")?,
        recipe_id: text(row, "recipe_id")?,
        version: text(row, "version")?,
        status: text(row, "status")?,
        submitted_at: number(row, "submitted_at")?,
    })
}

pub mod sql {
    use crate::ids::SubmissionId;
    use crate::store::Status;

    const COLUMNS: &str = "id, recipe_id, version, status, submitted_at";

    pub fn pending() -> String {
        format!("SELECT {COLUMNS} FROM submissions WHERE status = 'pending' ORDER BY submitted_at")
    }

    pub fn submission(id: &SubmissionId) -> String {
        format!("SELECT {COLUMNS} FROM submissions WHERE id = '{id}'")
    }

    pub fn set_status(id: &SubmissionId, status: Status) -> String {
        format!(
            "UPDATE submissions SET status = '{}' WHERE id = '{id}' AND status = 'pending'",
            status.as_str()
        )
    }

    pub fn reports() -> String {
        "SELECT recipe_id, reason, COUNT(*) AS n, MAX(reported_at) AS latest FROM reports \
         GROUP BY recipe_id, reason ORDER BY n DESC, recipe_id, reason"
            .to_owned()
    }
}

impl Store for WranglerStore {
    fn get_object(&self, key: &str) -> Result<Option<Vec<u8>>> {
        let path = self.object_path(key)?;
        let dir = tempfile::tempdir()?;
        let file = dir.path().join("object");
        let file_arg = file.to_string_lossy();
        let args = [
            "r2", "object", "get", &path, "--file", &file_arg, "--remote",
        ];
        let output = self.run(&args)?;
        if output.status.success() {
            return Ok(Some(std::fs::read(&file)?));
        }
        let text = format!(
            "{}\n{}",
            String::from_utf8_lossy(&output.stderr),
            String::from_utf8_lossy(&output.stdout)
        );
        if looks_missing(&text) && !looks_unauthenticated(&text) {
            Ok(None)
        } else {
            Err(failure(&args, &output))
        }
    }

    fn put_object(&self, key: &str, bytes: &[u8]) -> Result<()> {
        let path = self.object_path(key)?;
        let dir = tempfile::tempdir()?;
        let file = dir.path().join("object");
        std::fs::write(&file, bytes)?;
        let file_arg = file.to_string_lossy();
        self.run_checked(&[
            "r2",
            "object",
            "put",
            &path,
            "--file",
            &file_arg,
            "--content-type",
            content_type(key),
            "--remote",
            "--force",
        ])
        .map(drop)
    }

    fn delete_object(&self, key: &str) -> Result<()> {
        let path = self.object_path(key)?;
        self.run_checked(&["r2", "object", "delete", &path, "--remote", "--force"])
            .map(drop)
    }

    fn pending_submissions(&self) -> Result<Vec<SubmissionRow>> {
        self.d1(&sql::pending(), false)?
            .rows
            .iter()
            .map(submission_row)
            .collect()
    }

    fn submission(&self, id: &SubmissionId) -> Result<Option<SubmissionRow>> {
        self.d1(&sql::submission(id), false)?
            .rows
            .first()
            .map(submission_row)
            .transpose()
    }

    fn set_submission_status(&self, id: &SubmissionId, status: Status) -> Result<()> {
        let result = self.d1(&sql::set_status(id, status), true)?;
        match result.changes {
            Some(0) => Err(Error::Refused("the submission is not pending".into())),
            _ => Ok(()),
        }
    }

    fn report_counts(&self) -> Result<Vec<ReportCount>> {
        self.d1(&sql::reports(), false)?
            .rows
            .iter()
            .map(|row| {
                Ok(ReportCount {
                    recipe_id: text(row, "recipe_id")?,
                    reason: text(row, "reason")?,
                    count: u64::try_from(number(row, "n")?).unwrap_or_default(),
                    latest: number(row, "latest")?,
                })
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const UUID: &str = "0b9a4d3e-7c21-4f5a-9d10-2c3b4a5d6e7f";

    #[test]
    fn d1_output_is_parsed_past_banners_and_trailing_text() {
        let out = "\n ⛅️ wrangler 4.0\n[\n  {\n    \"results\": [{\"id\": \"a\", \"n\": 3}],\n    \"success\": true,\n    \"meta\": {\"changes\": 1}\n  }\n]\n\nupdate available\n";
        let parsed = parse_d1(out).unwrap();
        assert_eq!(parsed.rows.len(), 1);
        assert_eq!(parsed.changes, Some(1));
        assert_eq!(parsed.rows[0].get("n").and_then(Value::as_i64), Some(3));
    }

    #[test]
    fn d1_output_without_results_or_meta_is_an_empty_result() {
        let parsed = parse_d1("[{\"success\": true}]").unwrap();
        assert!(parsed.rows.is_empty());
        assert_eq!(parsed.changes, None);
    }

    #[test]
    fn malformed_or_failed_d1_output_is_an_error() {
        for out in [
            "",
            "no json here",
            "[",
            "[]",
            "[{\"success\": false}]",
            "{\"a\": 1}",
        ] {
            assert!(parse_d1(out).is_err(), "{out:?}");
        }
    }

    #[test]
    fn rows_need_the_expected_columns() {
        let ok: Map<String, Value> = serde_json::from_str(
            r#"{"id":"a","recipe_id":"market.a","version":"1.0.0","status":"pending","submitted_at":5}"#,
        )
        .unwrap();
        assert_eq!(submission_row(&ok).unwrap().submitted_at, 5);
        let bad: Map<String, Value> = serde_json::from_str(r#"{"id":"a"}"#).unwrap();
        assert!(submission_row(&bad).is_err());
    }

    #[test]
    fn sql_embeds_only_validated_ids() {
        let id = SubmissionId::parse(UUID).unwrap();
        assert_eq!(
            sql::submission(&id),
            format!(
                "SELECT id, recipe_id, version, status, submitted_at FROM submissions WHERE id = '{UUID}'"
            )
        );
        assert_eq!(
            sql::set_status(&id, Status::Rejected),
            format!(
                "UPDATE submissions SET status = 'rejected' WHERE id = '{UUID}' AND status = 'pending'"
            )
        );
    }

    #[test]
    fn object_keys_are_checked_before_they_reach_wrangler() {
        assert!(check_key("recipes/market.a/1.0.0.json").is_ok());
        for key in ["", "/abs", "a b", "a;rm", "A", "a$(x)", "--flag\n"] {
            assert!(check_key(key).is_err(), "{key:?}");
        }
    }

    #[test]
    fn failures_are_classified() {
        assert!(looks_missing(
            "The specified key does not exist. [code: 10007]"
        ));
        assert!(!looks_missing("network unreachable"));
        assert!(!looks_missing(
            "The specified bucket does not exist. [code: 10006]"
        ));
        assert!(looks_unauthenticated(
            "You are not authenticated. Please run `wrangler login`."
        ));
        assert!(!looks_unauthenticated("The specified key does not exist."));
    }

    #[test]
    fn a_missing_wrangler_binary_is_reported_clearly() {
        let store = WranglerStore::new(
            "definitely-not-a-real-wrangler-binary".into(),
            std::env::temp_dir(),
            "b".into(),
            "d".into(),
        );
        assert!(matches!(
            store.delete_object("pending/x.json"),
            Err(Error::WranglerMissing(_))
        ));
    }
}
