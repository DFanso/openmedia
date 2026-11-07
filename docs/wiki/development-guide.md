# Development Guide

> **Status: Partially implemented.** The web and Rust checks and `yarn tauri ios dev` are verified. Android is not built (the Kotlin plugin code was removed until iOS is stable), and on desktop the shell runs but opening a site returns "site views are not implemented on desktop yet".

## Prerequisites

| Tool | Needed for |
|------|------------|
| Rust (stable, 1.90 or newer) + `cargo`, plus the `aarch64-apple-ios-sim` and `aarch64-apple-ios` targets | Core, iOS |
| Node 22 or newer + yarn 1.x | Shell, tooling (CI uses 22; also ran on 26) |
| Xcode (+ command line tools), CocoaPods, XcodeGen | iOS builds, iOS plugin (Swift) |
| Android Studio + NDK, JDK | Android builds (not built yet) |
| WebView2 runtime / WebKitGTK dev packages | Windows / Linux builds (deferred) |

## Commands

```bash
yarn install
APPLE_DEVELOPMENT_TEAM=<team id> yarn tauri ios dev "iPhone 17 Pro Max"   # iOS simulator

yarn ts:check && yarn lint && yarn format:check && yarn test
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/plugins/tauri-plugin-siteview/Cargo.toml
scripts/test-domain-scope.sh   # iOS plugin's domain-pinning rules (needs only swiftc)
```

Not built: `yarn tauri android dev` (the Android site view does not exist yet), `yarn tauri dev` (desktop site view).

## Conventions

- Work in a worktree under `.worktrees/` (see `AGENTS.md`).
- Conventional-commit prefixes: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, with scope = area (`engine`, `ai`, `recipes`, `shell`, `siteview`, `secrets`, `ios`, `android`).
- Recipe schema is defined in Rust; regenerate TS types and JSON Schema after any schema change (`yarn gen:schema`, added with the schema).
- Bundled recipe changes require fixture updates in `recipes/fixtures/<site>/`.
- Fixtures are scrubbed of personal data before commit; raw captures go in the gitignored `captures/`.
- Bundled filter lists in `blocklists/` are refreshed only with `scripts/update-blocklists.sh` and shipped with a release; the app never downloads them. Run `cargo test ad_block` after a refresh ([Ad Blocking](./ad-blocking.md#updating-the-lists)).

## Troubleshooting

- **Blank black app, no console errors.** Check for a Tauri command that is not `async` yet calls the plugin: it deadlocks the main thread. `sample <pid> 2` on the `OpenMedia` process shows the main thread inside the command. Fix by making the command `async`.
- **Port 1420 stuck.** A leftover Vite dev server from an earlier `tauri ios dev` makes the next run fail with "Port 1420 is already in use". Kill it (`lsof -ti :1420 | xargs kill`) and retry.
- **Plain `http://` sites on iOS.** App Transport Security is expected to block them [INFERENCE: not observed in this app; the localhost fixture was only ever loaded with the exception in place]. For local testing add a temporary `NSAllowsLocalNetworking` exception to `src-tauri/gen/apple/openmedia_iOS/Info.plist` and remove it afterwards.
