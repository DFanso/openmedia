pub type Result<T> = std::result::Result<T, Error>;

/// Messages never include key material: the signing key is read in one place and only its
/// validity is ever reported.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("{0}")]
    InvalidInput(String),
    #[error("the submission is not valid and was not touched: {0}")]
    Validation(String),
    #[error("refused: {0}")]
    Refused(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("signing key: {0}")]
    Key(String),
    #[error(
        "could not run `{0}`: it is not installed or not on PATH (install it with `npm i -g wrangler`, or pass --wrangler <path>)"
    )]
    WranglerMissing(String),
    #[error(
        "wrangler is not logged in to Cloudflare: run `wrangler login`, or set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID"
    )]
    WranglerAuth,
    #[error("wrangler {command} failed: {detail}")]
    Wrangler { command: String, detail: String },
    #[error("unexpected wrangler output: {0}")]
    UnexpectedOutput(String),
    #[error("--worker-dir (or OPENMEDIA_WORKER_DIR) must point at the Worker repository")]
    WorkerDirRequired,
    #[error("--key (or OPENMEDIA_CURATOR_KEY) must point at the signing key file")]
    KeyRequired,
    #[error(transparent)]
    Lib(#[from] openmedia_lib::error::Error),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}
