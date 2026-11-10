//! The curator CLI: the only thing that ever holds the catalog signing key. See README.md.

mod display;
mod error;
#[cfg(test)]
mod fake;
mod ids;
mod inspect;
mod key;
mod publish;
mod store;
#[cfg(test)]
mod testing;
mod wrangler;

use std::{
    path::PathBuf,
    process::ExitCode,
    time::{SystemTime, UNIX_EPOCH},
};

use clap::{Args, Parser, Subcommand};

use error::{Error, Result};
use ids::{RecipeId, SubmissionId, Version, parse_sha256, printable};
use key::Signer;
use publish::{IndexTrust, Issued, RevokeRequest};
use store::{DryRun, Store};
use wrangler::WranglerStore;

const AFTER_HELP: &str = "\
IMPORTANT: run `curator republish` at least every 3 weeks. Every signed index expires 30 days \
after it is issued, and once it expires every device refuses the catalog. Approve, revoke and \
republish all issue a fresh 30-day index.

Publish order is: recipe file, index.json, index.json.sig. Between the last two uploads the \
edge can briefly hold an index and a signature that do not match; devices then reject it and \
retry later. If the process dies between them, re-run `curator republish`.

--dry-run (on every command that changes anything) reads from Cloudflare, validates and signs \
locally, prints what it would upload or execute, and performs no remote write.";

#[derive(Parser)]
#[command(name = "curator", version, about = "Review, approve, revoke and sign the OpenMedia recipe catalog", after_help = AFTER_HELP)]
struct Cli {
    /// Signing key file (signing commands only; must not be group or world readable).
    #[arg(long, global = true, env = "OPENMEDIA_CURATOR_KEY")]
    key: Option<PathBuf>,
    /// The Worker repository, so wrangler picks up its wrangler.jsonc bindings.
    #[arg(long, global = true, env = "OPENMEDIA_WORKER_DIR")]
    worker_dir: Option<PathBuf>,
    /// Key id written into the index and the public build-config line.
    #[arg(
        long,
        global = true,
        env = "OPENMEDIA_CURATOR_KEY_ID",
        default_value = "k1"
    )]
    key_id: String,
    /// The wrangler executable.
    #[arg(
        long,
        global = true,
        env = "OPENMEDIA_WRANGLER",
        default_value = "wrangler"
    )]
    wrangler: String,
    /// R2 bucket name (wrangler.jsonc r2_buckets).
    #[arg(
        long,
        global = true,
        env = "OPENMEDIA_BUCKET",
        default_value = "openmedia-catalog"
    )]
    bucket: String,
    /// D1 database name (wrangler.jsonc d1_databases).
    #[arg(
        long,
        global = true,
        env = "OPENMEDIA_DATABASE",
        default_value = "openmedia-marketplace"
    )]
    database: String,
    #[command(subcommand)]
    command: Command,
}

#[derive(Args)]
struct DryRunArgs {
    /// Validate and sign locally; print what would be uploaded or executed; write nothing remotely.
    #[arg(long)]
    dry_run: bool,
}

#[derive(Subcommand)]
enum Command {
    /// Create a signing key. Prints only the public build-config line.
    Keygen {
        /// Where to write the private key (mode 0600; never overwrites).
        #[arg(long)]
        out: PathBuf,
    },
    /// List pending submissions.
    Pending,
    /// Print the full review of a pending submission, exactly as a device would show it.
    Show { submission_id: String },
    /// Validate, publish and sign a pending submission.
    Approve {
        submission_id: String,
        /// Mark the recipe as featured in the catalog.
        #[arg(long)]
        featured: bool,
        #[command(flatten)]
        run: DryRunArgs,
    },
    /// Mark a submission rejected and delete its pending body.
    Reject {
        submission_id: String,
        /// Printed back so you can send it to the author; not stored.
        #[arg(long)]
        note: Option<String>,
        #[command(flatten)]
        run: DryRunArgs,
    },
    /// Withdraw a recipe: add it to the signed revocation list and delist it.
    Revoke {
        recipe_id: String,
        /// Revoke this published version (default: the listed one).
        #[arg(long)]
        version: Option<String>,
        /// Revoke by file hash, for a recipe that is no longer listed or stored.
        #[arg(long, conflicts_with = "version")]
        sha256: Option<String>,
        #[command(flatten)]
        run: DryRunArgs,
    },
    /// Re-sign the current index with a fresh 30-day expiry. MUST run before expiresAt.
    #[command(after_help = "Devices refuse an expired catalog. Run this at least every 3 weeks.")]
    Republish {
        /// Recovery after a publish died between index.json and index.json.sig: build on the
        /// published index without verifying its (stale) signature. Inspect index.json first.
        #[arg(long)]
        accept_unsigned_index: bool,
        #[command(flatten)]
        run: DryRunArgs,
    },
    /// List reports grouped by recipe and reason.
    Reports,
}

fn now() -> Result<i64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|elapsed| i64::try_from(elapsed.as_secs()).ok())
        .ok_or_else(|| Error::InvalidInput("the system clock is not usable".into()))
}

fn open_store(cli: &Cli, dry_run: bool) -> Result<Box<dyn Store>> {
    let worker_dir = cli.worker_dir.clone().ok_or(Error::WorkerDirRequired)?;
    let store = WranglerStore::new(
        cli.wrangler.clone(),
        worker_dir,
        cli.bucket.clone(),
        cli.database.clone(),
    );
    Ok(if dry_run {
        Box::new(DryRun(store))
    } else {
        Box::new(store)
    })
}

fn load_signer(cli: &Cli) -> Result<Signer> {
    let path = cli.key.as_deref().ok_or(Error::KeyRequired)?;
    Signer::load(path, &cli.key_id)
}

fn report_issued(issued: &Issued, dry_run: bool) {
    println!(
        "Index sequence {}, issued {}, expires {}.",
        issued.sequence,
        display::format_utc(issued.issued_at),
        display::format_utc(issued.expires_at)
    );
    println!("Run `curator republish` before that date or every device refuses the catalog.");
    if dry_run {
        println!("dry-run: nothing was written remotely.");
    }
}

fn run(cli: &Cli) -> Result<()> {
    match &cli.command {
        Command::Keygen { out } => {
            println!("{}", key::keygen(out, &cli.key_id)?);
            println!(
                "Private key written to {} (mode 0600). Back it up offline now and never commit it: \
                 whoever holds it can publish to every device.",
                out.display()
            );
            Ok(())
        }
        Command::Pending => {
            print!(
                "{}",
                display::pending_list(&open_store(cli, false)?.pending_submissions()?)
            );
            Ok(())
        }
        Command::Show { submission_id } => {
            let id = SubmissionId::parse(submission_id)?;
            let review = inspect::review(&*open_store(cli, false)?, &id)?;
            print!("{}", review.text);
            if review.warnings > 0 {
                eprintln!(
                    "{} warning(s) above: read them before approving.",
                    review.warnings
                );
            }
            Ok(())
        }
        Command::Approve {
            submission_id,
            featured,
            run,
        } => {
            let id = SubmissionId::parse(submission_id)?;
            let signer = load_signer(cli)?;
            let store = open_store(cli, run.dry_run)?;
            let approved = publish::approve(&*store, &signer, &id, *featured, now()?)?;
            println!(
                "Approved {} {} ({} bytes, sha256 {}).",
                approved.recipe_id, approved.version, approved.size, approved.sha256
            );
            report_issued(&approved.issued, run.dry_run);
            Ok(())
        }
        Command::Reject {
            submission_id,
            note,
            run,
        } => {
            let id = SubmissionId::parse(submission_id)?;
            publish::reject(&*open_store(cli, run.dry_run)?, &id)?;
            println!("Rejected {id}.");
            if let Some(note) = note {
                println!("Send this note to the author: {}", printable(note));
            }
            Ok(())
        }
        Command::Revoke {
            recipe_id,
            version,
            sha256,
            run,
        } => {
            let id = RecipeId::parse(recipe_id)?;
            let version = version.as_deref().map(Version::parse).transpose()?;
            let sha256 = sha256.as_deref().map(parse_sha256).transpose()?;
            let signer = load_signer(cli)?;
            let store = open_store(cli, run.dry_run)?;
            let request = RevokeRequest {
                id: &id,
                version: version.as_ref(),
                sha256: sha256.as_deref(),
            };
            let revoked = publish::revoke(&*store, &signer, &request, now()?)?;
            let listing = if revoked.delisted {
                "and delisted it"
            } else {
                "(the listed version stays)"
            };
            println!("Revoked {id} sha256 {} {listing}.", revoked.sha256);
            report_issued(&revoked.issued, run.dry_run);
            Ok(())
        }
        Command::Republish {
            accept_unsigned_index,
            run,
        } => {
            let signer = load_signer(cli)?;
            let store = open_store(cli, run.dry_run)?;
            let trust = if *accept_unsigned_index {
                IndexTrust::AcceptUnsigned
            } else {
                IndexTrust::Verified
            };
            let issued = publish::republish(&*store, &signer, trust, now()?)?;
            println!("Republished the catalog.");
            report_issued(&issued, run.dry_run);
            Ok(())
        }
        Command::Reports => {
            print!(
                "{}",
                display::report_list(&open_store(cli, false)?.report_counts()?)
            );
            Ok(())
        }
    }
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    match run(&cli) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("error: {error}");
            ExitCode::FAILURE
        }
    }
}
