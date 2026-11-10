# Updates (OTA)

> **Status: Implemented, with verification limits.** The web bundle path was run end to end on a macOS debug build (see [Verification](#verification)). Publishing to GitHub, the desktop self-update install, Windows and Linux, and every mobile device were not exercised.

Two independent mechanisms, one CLI (`yarn ota`), and the same CLI inside GitHub Actions.

| | Web bundle | Desktop self-update |
|---|---|---|
| Replaces | The React shell (`dist/`) | The whole app binary |
| Platforms | iOS, Android, macOS, Windows, Linux | Builds distributed outside the stores (direct macOS, Windows, Linux) |
| Mechanism | In-repo: `src-tauri/src/ota/` | `tauri-plugin-updater`, behind the `self-update` Cargo feature (`src-tauri/src/self_update.rs`) |
| Trust | Ed25519 over the bundle, key in `src-tauri/ota-public-key.txt` | Minisign, key in `src-tauri/tauri.ota.conf.json` |
| Hosted at | Release `ota` (pre-release): `latest-<version>.json` + `bundle-<version>-<revision>.ota` | The repository's latest release: `latest.json` + installers |
| Applies | Next launch, silently (checked 10 s after launch, and from Settings → Updates) | On the user's tap in Settings → Updates, then restarts |

Store builds (iOS App Store, Play, Mac App Store) never contain the self-update code: the stores forbid an app replacing itself. They still get web bundles.

## The web bundle

A bundle is `signature (64 bytes) ‖ gzip(manifest JSON)`; the manifest carries `format`, `runtimeVersion`, `revision` and every file, base64. The signature covers a context string and the gzip bytes, so the app verifies before it decompresses or parses (`ota/bundle.rs`; the writer is `scripts/lib/ota-bundle.mjs`, and a Rust test opens a bundle the CLI wrote).

**Runtime version.** A bundle runs only on the native app whose `tauri.conf.json` `version` it was built for. The shell calls Rust commands; a bundle for another version could call ones that do not exist. **Bump `version` in the same change that touches Rust, a plugin, a capability or a permission.** A web-only change keeps the version and ships as a bundle. This rule is the whole compatibility story: CI publishes a bundle on every web-layer push to `main`, and nothing else checks the contract.

**Revision.** Unix seconds at publish time, so the newest wins with no counter to keep.

**Serving.** `OtaAssets` wraps Tauri's embedded assets (`Context::set_assets`). With an active bundle it serves only from the bundle, never mixing in an embedded file. The CLI adds Tauri's `__TAURI_STYLE_NONCE__` token to `index.html`'s inline `<style>`, as the build does for the embedded copy; without it the CSP would block the splash styles.

**Download.** `ota/client.rs`: HTTPS only, redirects only to HTTPS, every body size-capped, fixed error messages. The pointer is not trusted for anything but the revision; the file name is derived from it and the signature decides.

**Launch lifecycle.** A downloaded bundle is *pending* until the next launch, so the page in front of the user never changes under them. At that launch it is *active but unconfirmed*; the shell calls `ota_confirm` once it has loaded (`App.tsx`). A bundle that fails to confirm on two launches in a row is deleted and the embedded shell runs again (`ota/store.rs`). Any failure (bad signature, wrong runtime, unreadable file, corrupt state) falls back to the embedded shell.

**What a bundle cannot change.** Native code, permissions, the injected site engine and the blocklists (compiled into the binary), and the CSP. The shell remains the only caller of the commands, and no command here is reachable from a site view ([Security](./security.md)).

## Publishing from your machine

```bash
yarn ota keygen            # once; see below
yarn ota web               # build, sign, publish the web bundle
yarn ota app               # build this Mac's installers, upload, refresh latest.json
yarn ota all               # both
yarn ota web --dry-run     # build and sign into release/ota/, publish nothing
```

Needs the GitHub CLI logged in (`gh auth login`). The repository is `repository` in `src-tauri/Cargo.toml` (also what the app downloads from, at compile time) or `OTA_REPO`.

`yarn ota app` builds for the machine it runs on (`--target <triple>` for another Rust target, e.g. `x86_64-apple-darwin` or `universal-apple-darwin`). Installers are named `OpenMedia_<version>_<platform>.<ext>`; `latest.json` is rebuilt from every signed installer on the release, so builds from several machines accumulate. `yarn ota manifest` rebuilds it on its own. The notes the updater shows come from `--notes "…"`.

A desktop release needs the version bumped in `tauri.conf.json` first (the updater compares versions), then:

```bash
git tag v1.1.0 && git push origin v1.1.0   # creates the release's tag; or let `yarn ota app` create it from HEAD
yarn ota app --notes "What changed"
```

Without Apple signing and notarization variables the macOS build is ad-hoc signed: the updater works, but Gatekeeper warns on first install. Set the `APPLE_*` variables Tauri documents in the environment to sign and notarize.

## Keys

`yarn ota keygen` makes both keys in `~/.openmedia/ota/` (`OPENMEDIA_OTA_KEY_DIR` to move it), writes the two public halves into the repository (`src-tauri/ota-public-key.txt`, `src-tauri/tauri.ota.conf.json`) and refuses to overwrite existing keys. `--github` also stores the private halves as repository secrets.

- **Losing a key** means no installed app accepts another update: every app already installed trusts only the public key it was built with. Back the folder up.
- **Rotating** (`--force`) needs a new app release through the stores first, then the new key.
- Neither private key is ever committed (`*.key` is gitignored).

## GitHub Actions

`.github/workflows/ota.yml` runs the same commands:

| Trigger | Does |
|---|---|
| Push to `main` touching the web layer | `yarn ota web` on Ubuntu (cheap minutes) |
| Push of a `v*` tag | web bundle, then `yarn ota app --no-manifest` on macOS, then `yarn ota manifest` |
| Manual run | web, app, or all |

Secrets: `OPENMEDIA_OTA_KEY`, `TAURI_SIGNING_PRIVATE_KEY`, and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if the key has one (all set by `yarn ota keygen --github`); `OPENMEDIA_MARKET_URL`, `OPENMEDIA_CATALOG_KEYS` and `OPENMEDIA_RC_KEY_MACOS` for the desktop build, as `build.rs` reads them. The macOS runner is the costly one and only runs on a tag. Windows and Linux are left out of the matrix until their site views exist (an installer would open an app that cannot show a page).

## Requirements on the repository

The app downloads without credentials, so the release assets must be public. While the repository is private every check returns "Could not reach the update server."; making the repository public, or pointing `repository` in `Cargo.toml` and the endpoint in `tauri.ota.conf.json` at a public releases repository, fixes it (a test keeps those two in step).

## Privacy

A check is a plain `GET` to github.com: no identifier, no cookie, nothing about the user or their browsing; GitHub sees the IP address, as for any download (invariant 1, destination (d)). The launch check runs without a prompt and has no setting; the desktop install always waits for a tap.

## Verification

- `cargo test --lib ota`: signature, tamper, runtime, path, format and size checks; the launch lifecycle and rollback; a bundle written by the CLI.
- `yarn vitest run scripts`: bundle round trip, `latest.json` assembly, platform names, and that the updater endpoint matches `Cargo.toml`'s repository.
- Run by hand on a macOS debug build whose embedded shell predates `ota_confirm`: a bundle placed in the app's data folder became active and was confirmed, which only a page served from the bundle, with working IPC, could do. The same build with no bundle ran from the embedded shell. The window was not inspected visually.
- Not verified: a real publish to GitHub; `yarn ota app` (a signed desktop build and the updater installing it); how an OTA-served page looks (the style nonce is covered by a unit test, not by eye); Android and iOS.
