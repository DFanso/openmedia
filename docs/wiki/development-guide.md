# Development Guide

> **Status: Design.** None of these commands work yet; Phase 1 of the [Roadmap](./roadmap.md) creates the scaffold and flips this page to `Implemented`.

## Prerequisites (planned)

| Tool | Needed for |
|------|------------|
| Rust (stable) + `cargo` | Core, all platforms |
| Node 22 + yarn | Shell, engine, tooling |
| Tauri CLI v2 | `yarn tauri ...` |
| Xcode (+ command line tools) | macOS and iOS builds, iOS plugin (Swift) |
| Android Studio + NDK, JDK | Android builds, Android plugin (Kotlin) |
| WebView2 runtime / WebKitGTK dev packages | Windows / Linux builds |

## Commands (planned)

```bash
yarn install
yarn tauri dev                  # desktop dev
yarn tauri ios dev              # iOS simulator/device
yarn tauri android dev          # Android emulator/device

yarn ts:check && yarn lint && yarn format:check && yarn test
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

## Conventions

- Work in a worktree under `.worktrees/` (see `AGENTS.md`).
- Conventional-commit prefixes: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, with scope = area (`engine`, `ai`, `recipes`, `shell`, `siteview`, `secrets`, `ios`, `android`).
- Recipe schema is defined in Rust; regenerate TS types and JSON Schema after any schema change (`yarn gen:schema`, added with the schema).
- Bundled recipe changes require fixture updates in `recipes/fixtures/<site>/`.
- Fixtures are scrubbed of personal data before commit; raw captures go in the gitignored `captures/`.

## Troubleshooting

To be filled in as real problems are met.
