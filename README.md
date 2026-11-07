<p align="center">
  <img src="assets/logo.svg" alt="OpenMedia logo" height="140">
</p>

<h1 align="center">OpenMedia</h1>

<p align="center">
  Browse the real web, minus the parts you did not ask for.<br>
  One full-screen page and one floating button. No backend.
</p>

<p align="center">
  <a href="https://github.com/skepjandi/openmedia/actions/workflows/ci.yml"><img src="https://github.com/skepjandi/openmedia/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/platform-iOS%2017%2B-lightgrey.svg" alt="iOS 17+">
  <img src="https://img.shields.io/badge/Tauri-v2-24C8DB.svg" alt="Tauri v2">
</p>

---

## Why

- **The real site, not a copy.** Pages load in a native web view; you log in to the actual origin and your session stays on the device.
- **Customization is data.** What gets hidden is a declarative recipe, so it can be read, tested against DOM fixtures, and fixed when a site changes. Reddit's "open the app" prompts are the first bundled recipe.
- **Out of the way.** The web fills the screen. A single draggable button holds everything else.
- **Local first.** No server, no telemetry, no account. The only network traffic is the sites you open.

## Highlights

- **Floating button:** tap to type an address, hold to fan out your favorites (Instagram, Facebook, Twitter, Reddit by default) with settings set apart, drag it to either edge.
- **Favorites:** edit, reorder, and add the current page from the app.
- **Recipes:** bundled, validated in Rust, injected at document start so removed things never flash.
- **Profiles:** each profile has its own isolated cookie and storage store (iOS 17+).
- **First-run guide:** four short steps, replayable from Settings.
- **Planned:** an AI assistant that writes recipes with your own API key, a catalog of bundled recipes, Android, desktop. See the [roadmap](docs/wiki/roadmap.md).

## Status

Early. It runs on the **iOS simulator**. Not built yet: Android, desktop site views, and the AI assistant (the prompt box accepts addresses only). Nothing has been tested on a physical device. What was and was not verified is listed in [Platform Support](docs/wiki/platform-support.md#verified-results).

## Run it

Needs a Mac with Xcode, [Rust](https://rustup.rs) 1.90+, Node 22+ and yarn 1.x, CocoaPods and XcodeGen.

```bash
rustup target add aarch64-apple-ios-sim aarch64-apple-ios
yarn install
APPLE_DEVELOPMENT_TEAM=<your team id> yarn tauri ios dev "iPhone 17 Pro Max"
```

Use any installed simulator name. Your team ID is in Xcode under Settings, Accounts. If the run fails with "Port 1420 is already in use", kill the old dev server with `lsof -ti :1420 | xargs kill`.

Checks, the same set CI runs:

```bash
yarn ts:check && yarn lint && yarn format:check && yarn test
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/plugins/tauri-plugin-siteview/Cargo.toml
```

More in the [development guide](docs/wiki/development-guide.md).

## Stack

Tauri v2 · Rust · React 19 · TypeScript (strict) · Vite · Tailwind CSS v4 · Zustand · Vitest · a native `WKWebView` host written as an in-repo Tauri plugin (`src-tauri/plugins/tauri-plugin-siteview`).

## Docs

Everything else lives in the [wiki](docs/wiki/index.md): [architecture](docs/wiki/architecture.md), [UI design](docs/wiki/ui-design.md), [recipe format](docs/wiki/recipe-format.md), [security model](docs/wiki/security.md), [platform support](docs/wiki/platform-support.md), [prior art](docs/wiki/prior-art.md).

## Contributing

Read [AGENTS.md](AGENTS.md) first: wiki before code, work in a git worktree, and the architecture invariants (no backend, keys only in Rust, site views are hostile, recipes not code). Changes go through a branch and a pull request, and CI must pass.

## License

Not chosen yet.
