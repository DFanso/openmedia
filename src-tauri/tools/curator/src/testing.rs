use std::cell::Cell;

use crate::fake::FakeStore;
use crate::ids::SubmissionId;
use crate::key::{Signer, tests::test_signer};
use crate::publish::approve;
use crate::store::{SubmissionRow, pending_key};

pub const NOW: i64 = 1_800_000_000;

pub fn recipe_json(id: &str, version: &str, rules: usize, pattern: &str) -> String {
    let rules: Vec<String> = (0..rules)
        .map(|n| {
            format!(
                r#"{{"id":"r{n}","label":"r{n}","type":"css","target":{{"css":".x{n}"}},"declarations":{{"display":"none"}}}}"#
            )
        })
        .collect();
    format!(
        r#"{{"schema":1,"id":"{id}","name":"Calm","version":"{version}","origin":"user","match":["{pattern}"],"options":[],"rules":[{}],"meta":{{"author":"Ada"}}}}"#,
        rules.join(",")
    )
}

pub struct Fixture {
    pub store: FakeStore,
    pub signer: Signer,
    counter: Cell<u32>,
}

impl Fixture {
    pub fn new() -> Self {
        Self {
            store: FakeStore::default(),
            signer: test_signer(),
            counter: Cell::new(0),
        }
    }

    pub fn submit_with_row(&self, json: &str, recipe_id: &str, version: &str) -> SubmissionId {
        self.insert(json, "Quieter pages", recipe_id, version)
    }

    pub fn submit_with_summary(&self, json: &str, summary: &str) -> SubmissionId {
        let (recipe_id, version) = ids_in(json);
        self.insert(json, summary, &recipe_id, &version)
    }

    pub fn submit(&self, json: &str) -> SubmissionId {
        self.submit_with_summary(json, "Quieter pages")
    }

    fn insert(&self, json: &str, summary: &str, recipe_id: &str, version: &str) -> SubmissionId {
        self.counter.set(self.counter.get() + 1);
        let text = format!("{:08x}-0000-4000-8000-000000000000", self.counter.get());
        let id = SubmissionId::parse(&text).unwrap();
        let body = format!(r#"{{"recipe":{json},"summary":"{summary}"}}"#);
        self.store.insert_object(&pending_key(&id), body.as_bytes());
        self.store.insert_submission(SubmissionRow {
            id: text,
            recipe_id: recipe_id.to_owned(),
            version: version.to_owned(),
            status: "pending".into(),
            submitted_at: NOW - 100,
        });
        id
    }

    pub fn publish(&self, json: &str) {
        let id = self.submit(json);
        approve(&self.store, &self.signer, &id, false, NOW).unwrap();
    }
}

fn ids_in(json: &str) -> (String, String) {
    let value: serde_json::Value = serde_json::from_str(json).unwrap_or_default();
    let field = |name: &str| {
        value
            .get(name)
            .and_then(serde_json::Value::as_str)
            .unwrap_or("unknown")
            .to_owned()
    };
    (field("id"), field("version"))
}
