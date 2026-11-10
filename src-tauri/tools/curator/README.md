# OpenMedia curator

The maintainer's command line for the recipe marketplace ([`docs/wiki/marketplace.md`](../../../docs/wiki/marketplace.md)). It reviews submissions, approves, rejects and revokes recipes, and signs and publishes the catalog index. **It is the only program that ever holds the signing key.** The Cloudflare Worker has no admin API and no key; it only accepts submissions and serves files.

It validates with the app's own Rust code (`openmedia_lib::recipes::parse_catalog_recipe`, `openmedia_lib::catalog::index`), so what the curator accepts is exactly what a device accepts.

## Read this first: the monthly duty

> **Every signed index expires 30 days after it is issued. Run `curator republish` at least every 3 weeks.**
> Once `expiresAt` passes, **every device refuses the catalog** and the Marketplace stops working for everyone, until you republish. Approve, revoke and republish each issue a fresh 30-day index, so any publish resets the clock. Put a recurring reminder in your calendar.

```sh
curator republish
```

`republish` works even after expiry (it does not check the old index's expiry), and it only needs the key and a logged-in `wrangler`.

## Requirements

- [`wrangler`](https://developers.cloudflare.com/workers/wrangler/install-and-update/) 4.x on `PATH` (or pass `--wrangler <path>`), logged in to the Cloudflare account that owns the bucket and database: `wrangler login`, or set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
- A checkout of the Worker repository (`openmedia-worker`), with `wrangler.jsonc` filled in (real `database_id`). The curator runs wrangler from that directory so it finds the D1 binding.
- Names default to the Worker's `wrangler.jsonc`: bucket `openmedia-catalog`, database `openmedia-marketplace`. Override with `--bucket` / `--database`.

Build and run from `src-tauri/`:

```sh
cargo run -p openmedia-curator -- --help
# or: cargo build -p openmedia-curator --release   ->   target/release/curator
```

Global options (also usable after the subcommand):

| Option | Env | Meaning |
|---|---|---|
| `--key <path>` | `OPENMEDIA_CURATOR_KEY` | Signing key file. Needed by approve, revoke, republish |
| `--key-id <id>` | `OPENMEDIA_CURATOR_KEY_ID` | Key id written into the index; default `k1` |
| `--worker-dir <path>` | `OPENMEDIA_WORKER_DIR` | Worker repo; required for every command that talks to Cloudflare |
| `--wrangler <program>` | `OPENMEDIA_WRANGLER` | wrangler executable; default `wrangler` |
| `--bucket`, `--database` | `OPENMEDIA_BUCKET`, `OPENMEDIA_DATABASE` | Resource names |

A convenient shell setup:

```sh
export OPENMEDIA_WORKER_DIR=~/src/openmedia-worker
export OPENMEDIA_CURATOR_KEY=~/.openmedia/curator.key
```

## One-time setup

1. **Create the key**

   ```sh
   mkdir -p ~/.openmedia && chmod 700 ~/.openmedia
   curator keygen --out ~/.openmedia/curator.key --key-id k1
   ```

   It refuses to overwrite an existing file, creates the file with mode `0600` from the start, and prints **only** the public line, for example:

   ```
   OPENMEDIA_CATALOG_KEYS=k1:7vK3…base64…=
   ```

   The private key (raw PKCS#8 DER) is never printed.

2. **Back the key up offline** (encrypted USB stick, password manager attachment, printed and stored safely). If you lose it you cannot publish; you would have to ship a new app release with a new public key. **Never commit it**, never put it on Cloudflare, in CI or in a cloud-synced folder. The curator refuses a key file that is readable by group or others.

3. **Give the app the public key.** Paste the printed line into the `.env` used for release builds (the app reads `OPENMEDIA_CATALOG_KEYS` and `OPENMEDIA_MARKET_URL` at build time; `.env` is gitignored):

   ```
   OPENMEDIA_MARKET_URL=https://worker.openmedia.surf
   OPENMEDIA_CATALOG_KEYS=k1:7vK3…base64…=
   ```

   Several keys can be listed, comma separated (`k1:…,k2:…`), which is how a key rotates with an app release. Rebuild the app after changing it.

4. **Publish the first catalog** by approving a first submission (an empty catalog is created automatically, sequence `0` then `1`).

## Commands

```sh
curator pending                       # id, recipe id, version, submitted time
curator show <submission-id>          # the full review (exit code 1 if invalid)
curator approve <submission-id> [--featured] [--dry-run]
curator reject  <submission-id> [--note "why"] [--dry-run]
curator revoke  <recipe-id> [--version 1.2.0 | --sha256 <hex>] [--dry-run]
curator republish [--dry-run]         # MUST run before expiresAt
curator reports                       # grouped by recipe id and reason
```

### `show`

Prints what the device would show in its review (the same `preview_recipe` the app calls): id, name, version, author, notes, summary, **every** `match` pattern, every option, and **every** rule with its type, label, selector and declarations. Above that, lines starting `!!! WARNING` flag:

- a host pattern that is very short, a single label (bare TLD style `*.com`) or looks like a public suffix (`*.co.uk`);
- an id that is already published at another version, with the old and new rule counts (`rules: 2 -> 5 (+3)`);
- a version that is not newer than the published one, or whose file already exists (approve will refuse).

A submission that fails validation prints the reason and exits non-zero. The pending body is stored by the Worker and is **never trusted**: the curator parses it again, and it must agree with the database row (same recipe id and version).

### `approve`

In order, with every check and the signing done **before the first remote write**:

1. Re-validate the pending body (same function as the device) and match it to the D1 row.
2. Serialize the validated recipe with `serde_json::to_vec` and hash it. Those exact bytes are what gets uploaded; nothing re-serializes them afterwards.
3. Refuse if `recipes/<id>/<version>.json` already exists (versions are immutable) or the version is not greater than the published one.
4. Load the published index and **verify its signature with your key**; refuse to build on an index that does not verify (a compromised Worker could otherwise get you to sign its edits). A missing index starts an empty catalog.
5. Add or replace the entry (author from `meta.author`, summary from the submission, hosts from the match patterns with a leading `*.` removed and de-duplicated, size, sha256, `publishedAt`, `featured`), bump `sequence`, set `issuedAt` to now and `expiresAt` to now + 30 days, sign.
6. Upload the recipe file, then `index.json`, then `index.json.sig`.
7. Mark the submission `approved` in D1 and delete `pending/<id>.json`.

If the process dies after step 6 but before step 7, the catalog is already correct. Re-running `approve` refuses (the version exists); mark the row by hand and delete the pending object:

```sh
cd $OPENMEDIA_WORKER_DIR
npx wrangler d1 execute openmedia-marketplace --remote --command "UPDATE submissions SET status='approved' WHERE id='<submission-id>'"
npx wrangler r2 object delete openmedia-catalog/pending/<submission-id>.json --remote
```

### `reject`

Marks the row `rejected` and deletes the pending body. It works on any pending submission, including one that fails validation. The `--note` is printed back so you can send it to the author; the D1 schema has no column for it, so it is not stored.

### `revoke`

Adds `{id, sha256}` to the signed `revoked` list, bumps the sequence and publishes. Devices disable an installed recipe whose `(id, sha256)` is listed, and refuse to download it.

- No flags: revokes the **listed** version and removes the id from `recipes`.
- `--version V`: revokes that version (hash taken from the index if it is the listed one, otherwise from the stored file `recipes/<id>/V.json`). The entry is removed only when it is the listed version; revoking an old version leaves the newer listed one alone.
- `--sha256 <hex>`: for a recipe that is no longer listed and whose file you no longer have.

Wrangler cannot list R2 objects, so to revoke several old versions run `revoke --version` once per version.

### `republish`

Re-signs the current index with `sequence + 1` and a fresh 30-day expiry. See the monthly duty above.

`--accept-unsigned-index` is for one situation only: a publish died between `index.json` and `index.json.sig` (see below). It builds on the published `index.json` without checking its stale signature, so open it first (`npx wrangler r2 object get openmedia-catalog/index.json --remote --pipe`) and check it is what you uploaded.

### `reports`

Counts of `reports` rows grouped by recipe id and reason, most reported first. Act with `show`-style review of the recipe and `revoke` if warranted.

### `--dry-run`

On approve, reject, revoke and republish: reads from Cloudflare (it must, to validate), performs all validation and signing locally, prints `dry-run: would upload …` / `would delete …` / `would mark …` for each write, and performs no remote write. (Deviation from "no remote call": reads are unavoidable.) The signing key is still needed, because signing is part of what is being checked.

## Publish order and failure behaviour

`recipes/<id>/<version>.json`, then `index.json`, then `index.json.sig`.

- A recipe file with no index entry is harmless.
- Between the `index.json` and `index.json.sig` uploads (a fraction of a second, plus edge cache time up to 5 minutes), the edge can serve a new index with the old signature, or an old index with the new one. A device verifies the signature before parsing and refuses the mismatch, then retries later. Nothing unsafe is ever accepted.
- If the curator dies, or the second upload fails, between those two uploads: the published `index.json` is new and `index.json.sig` is old, so devices refuse the catalog **until you fix it**. Re-run `curator republish --accept-unsigned-index` (after checking `index.json`). The normal verified path refuses on purpose and tells you so.

## Review checklist

Read `curator show` output as a user would, and ask:

- **Hides a security warning or a trust signal?** Selectors that match certificate/phishing banners, "not secure" / "deceptive site" interstitials, browser or account security prompts, two-factor and password-reset prompts, payment or checkout confirmations, "this link is unsafe" notices.
- **Hides login, consent or legal UI?** Login forms, cookie/consent dialogs, age gates, terms or pricing text, "sponsored" or "ad" labels (hiding ads is fine; hiding the *label* on something that is an ad is not).
- **Over-broad hosts?** Every `match` pattern should name the site the recipe is about. Flagged short hosts, bare TLDs, and sites unrelated to the name, author or summary are red flags. A recipe for one site must not reach a bank, mail or health site.
- **Misleading labels?** Rule and option labels, name and summary must say what the rule does. "Hide recommended videos" over a rule that hides the whole page, or a selector far broader than its label (`body`, `main`, `[role=dialog]`, `div`) is misleading.
- **`css` rules**: declarations that make things invisible (`opacity: 0`, `visibility: hidden`, `height: 0`) or unclickable (`pointer-events: none`) on controls the user needs (buy, confirm, sign in, close). `position`/`overflow` tricks that cover the page.
- **Homepage and author** make sense; nothing impersonates another publisher or app.
- **Version bump** of an existing id: compare the rule counts and what each new rule does, not just the summary.

When in doubt, `reject --note` with the reason. Publishing is never automatic.

## Security properties

- The key is read only by `approve`, `revoke` and `republish`, into zeroizing memory, validated as Ed25519 PKCS#8, and never printed, logged or placed in an error. The file must not be group/world readable (`chmod 600`).
- All remote access is `wrangler` with an argument array (no shell). Submission ids, recipe ids, versions and hashes are parsed with strict formats before they reach an argument or a SQL string; anything else is refused. Text from the database is stripped of control characters before printing.
- The signature of the published index is verified before the curator builds on it.
- Limitation: key rotation is not automated. The curator refuses to build on an index signed by a different key. To rotate, ship an app release trusting both keys (`k1:…,k2:…`), then remove `index.json` and `index.json.sig` from R2 and re-approve recipes with the new key.

## Tests

```sh
cd src-tauri
cargo test -p openmedia-curator
```

All logic runs against an in-memory `Store`; no wrangler or network is needed. The `wrangler`-backed implementation (`src/wrangler.rs`) is covered only for output parsing, id and key checking, and error classification, **not** against a real Cloudflare account.

## References (wrangler syntax used)

- R2 objects (`r2 object get|put|delete`, `--file`, `--remote`, `--content-type`, `--force`): <https://developers.cloudflare.com/workers/wrangler/commands/r2/>
- D1 (`d1 execute <DATABASE> --remote --json --command <SQL> --yes`): <https://developers.cloudflare.com/workers/wrangler/commands/d1/>
- Install and login: <https://developers.cloudflare.com/workers/wrangler/install-and-update/>, <https://developers.cloudflare.com/workers/wrangler/commands/general/#login>
- Contract and threat model: [`docs/wiki/marketplace.md`](../../../docs/wiki/marketplace.md)
