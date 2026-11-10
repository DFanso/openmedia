//! Everything the curator does to Cloudflare goes through `Store`, so the logic is tested against
//! an in-memory fake and the real implementation is a thin wrapper around `wrangler`.

use crate::error::Result;
use crate::ids::{RecipeId, SubmissionId, Version};

pub const INDEX_KEY: &str = "index.json";
pub const SIGNATURE_KEY: &str = "index.json.sig";

pub fn pending_key(id: &SubmissionId) -> String {
    format!("pending/{id}.json")
}

pub fn recipe_key(id: &RecipeId, version: &Version) -> String {
    format!("recipes/{id}/{version}.json")
}

/// A row of the Worker's `submissions` table. The fields are what D1 returned and are not
/// trusted until `inspect` has matched them against the pending body.
#[derive(Debug, Clone, PartialEq)]
pub struct SubmissionRow {
    pub id: String,
    pub recipe_id: String,
    pub version: String,
    pub status: String,
    pub submitted_at: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Status {
    Approved,
    Rejected,
}

impl Status {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Approved => "approved",
            Self::Rejected => "rejected",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct ReportCount {
    pub recipe_id: String,
    pub reason: String,
    pub count: u64,
    pub latest: i64,
}

pub trait Store {
    fn get_object(&self, key: &str) -> Result<Option<Vec<u8>>>;
    fn put_object(&self, key: &str, bytes: &[u8]) -> Result<()>;
    fn delete_object(&self, key: &str) -> Result<()>;
    fn pending_submissions(&self) -> Result<Vec<SubmissionRow>>;
    fn submission(&self, id: &SubmissionId) -> Result<Option<SubmissionRow>>;
    fn set_submission_status(&self, id: &SubmissionId, status: Status) -> Result<()>;
    fn report_counts(&self) -> Result<Vec<ReportCount>>;
}

/// Reads go through to the real store; every write is announced and skipped.
pub struct DryRun<S>(pub S);

impl<S: Store> Store for DryRun<S> {
    fn get_object(&self, key: &str) -> Result<Option<Vec<u8>>> {
        self.0.get_object(key)
    }

    fn put_object(&self, key: &str, bytes: &[u8]) -> Result<()> {
        println!("dry-run: would upload {key} ({} bytes)", bytes.len());
        Ok(())
    }

    fn delete_object(&self, key: &str) -> Result<()> {
        println!("dry-run: would delete {key}");
        Ok(())
    }

    fn pending_submissions(&self) -> Result<Vec<SubmissionRow>> {
        self.0.pending_submissions()
    }

    fn submission(&self, id: &SubmissionId) -> Result<Option<SubmissionRow>> {
        self.0.submission(id)
    }

    fn set_submission_status(&self, id: &SubmissionId, status: Status) -> Result<()> {
        println!("dry-run: would mark submission {id} as {}", status.as_str());
        Ok(())
    }

    fn report_counts(&self) -> Result<Vec<ReportCount>> {
        self.0.report_counts()
    }
}
