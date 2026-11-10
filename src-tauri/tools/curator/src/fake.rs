use std::{cell::RefCell, collections::HashMap};

use crate::error::{Error, Result};
use crate::ids::SubmissionId;
use crate::store::{ReportCount, Status, Store, SubmissionRow};

#[derive(Debug, Clone, PartialEq)]
pub enum Write {
    Put(String),
    Delete(String),
    Status(String, &'static str),
}

/// An in-memory `Store` that records every mutation in order.
#[derive(Default)]
pub struct FakeStore {
    objects: RefCell<HashMap<String, Vec<u8>>>,
    submissions: RefCell<Vec<SubmissionRow>>,
    writes: RefCell<Vec<Write>>,
    fail_put: RefCell<Option<String>>,
}

impl FakeStore {
    pub fn insert_object(&self, key: &str, bytes: &[u8]) {
        self.objects
            .borrow_mut()
            .insert(key.to_owned(), bytes.to_vec());
    }

    pub fn insert_submission(&self, row: SubmissionRow) {
        self.submissions.borrow_mut().push(row);
    }

    pub fn object(&self, key: &str) -> Option<Vec<u8>> {
        self.objects.borrow().get(key).cloned()
    }

    pub fn status_of(&self, id: &str) -> Option<String> {
        self.submissions
            .borrow()
            .iter()
            .find(|row| row.id == id)
            .map(|row| row.status.clone())
    }

    pub fn writes(&self) -> Vec<Write> {
        self.writes.borrow().clone()
    }

    pub fn fail_puts_of(&self, key: &str) {
        *self.fail_put.borrow_mut() = Some(key.to_owned());
    }
}

impl Store for FakeStore {
    fn get_object(&self, key: &str) -> Result<Option<Vec<u8>>> {
        Ok(self.object(key))
    }

    fn put_object(&self, key: &str, bytes: &[u8]) -> Result<()> {
        if self.fail_put.borrow().as_deref() == Some(key) {
            return Err(Error::Refused(format!("injected failure for {key}")));
        }
        self.writes.borrow_mut().push(Write::Put(key.to_owned()));
        self.insert_object(key, bytes);
        Ok(())
    }

    fn delete_object(&self, key: &str) -> Result<()> {
        self.writes.borrow_mut().push(Write::Delete(key.to_owned()));
        self.objects.borrow_mut().remove(key);
        Ok(())
    }

    fn pending_submissions(&self) -> Result<Vec<SubmissionRow>> {
        Ok(self
            .submissions
            .borrow()
            .iter()
            .filter(|row| row.status == "pending")
            .cloned()
            .collect())
    }

    fn submission(&self, id: &SubmissionId) -> Result<Option<SubmissionRow>> {
        Ok(self
            .submissions
            .borrow()
            .iter()
            .find(|row| row.id == id.as_str())
            .cloned())
    }

    fn set_submission_status(&self, id: &SubmissionId, status: Status) -> Result<()> {
        let mut rows = self.submissions.borrow_mut();
        let row = rows
            .iter_mut()
            .find(|row| row.id == id.as_str() && row.status == "pending")
            .ok_or_else(|| Error::Refused("the submission is not pending".into()))?;
        status.as_str().clone_into(&mut row.status);
        self.writes
            .borrow_mut()
            .push(Write::Status(id.to_string(), status.as_str()));
        Ok(())
    }

    fn report_counts(&self) -> Result<Vec<ReportCount>> {
        Ok(Vec::new())
    }
}

impl FakeStore {
    pub fn snapshot(
        &self,
    ) -> (
        std::collections::BTreeMap<String, Vec<u8>>,
        Vec<SubmissionRow>,
    ) {
        (
            self.objects
                .borrow()
                .iter()
                .map(|(key, bytes)| (key.clone(), bytes.clone()))
                .collect(),
            self.submissions.borrow().clone(),
        )
    }
}
