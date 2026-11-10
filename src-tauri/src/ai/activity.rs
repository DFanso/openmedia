//! What the assistant is doing while a request runs. The shell shows each step as a line of the
//! chat and keeps the finished steps with the turn. Only counts and fixed kinds travel here: the
//! shell writes the sentences, so nothing from the page or the model is shown as a step.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StepKind {
    /// The shell read and redacted the page. Reported by `ai_prepare`'s result, not by `send`.
    ReadPage,
    AskModel,
    CheckAnswer,
    PreviewOnPage,
    CountMatches,
    /// Another round: the answer failed validation, or rules matched nothing.
    Repair,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StepStatus {
    Running,
    Done,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Activity {
    pub kind: StepKind,
    pub status: StepStatus,
    /// 0 for the first answer, then 1 and 2 for repairs.
    pub round: u8,
    /// `CountMatches`: rules that matched at least one element.
    #[serde(default)]
    pub matched: Option<u32>,
    /// `CountMatches` and `PreviewOnPage`: rules in the answer. `Repair`: rules that matched
    /// nothing, or `None` when the answer failed validation instead.
    #[serde(default)]
    pub total: Option<u32>,
}

impl Activity {
    pub const fn new(kind: StepKind, status: StepStatus, round: u8) -> Self {
        Self {
            kind,
            status,
            round,
            matched: None,
            total: None,
        }
    }

    pub fn with_total(mut self, total: usize) -> Self {
        self.total = Some(u32::try_from(total).unwrap_or(u32::MAX));
        self
    }

    pub fn with_matched(mut self, matched: usize) -> Self {
        self.matched = Some(u32::try_from(matched).unwrap_or(u32::MAX));
        self
    }
}
