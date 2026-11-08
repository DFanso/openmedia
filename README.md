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
- **Local first.** No server, no telemetry, no account. Network requests go to opened sites and, only on request, your configured AI provider.

## Highlights

- **Floating button:** tap to type an address, hold to fan out your favorites (Instagram, Facebook, Twitter, Reddit, YouTube by default, with their site icons) and settings, drag it to either edge. A thin progress ring hugs its edge while held.
- **Favorites:** star the current page, a history entry or a pre-made recipe. Edit and reorder in Settings; the first six form quick access.
- **Pre-made recipes:** bundled site icons and per-site switches for 18 sites; hide Reels, Shorts, Stories, app prompts and more. Long Settings sections start collapsed.
- **Usage:** per-site foreground time with optional daily warnings and limits for any site. Top notices warn; exhausted sites are blurred, with interaction, navigation and media stopped until midnight or a policy change.
- **Pull to refresh** on the page, and **light, dark or system** theme that sites can follow.
- **Ad and tracker blocking:** EasyList and EasyPrivacy are built into the app and compiled to WebKit content rules, so ads and trackers are blocked before they load, with no list downloads. One switch in Settings.
- **Recipes:** bundled, validated in Rust, injected at document start so removed things never flash.
- **Profiles:** each profile has its own isolated cookie and storage store (iOS 17+).
- **First-run guide:** four short steps, replayable from Settings.
- **Bring your own AI key:** add providers (Anthropic, OpenAI, Gemini, OpenRouter, or a local OpenAI-compatible server) in Settings. Keys go to the iOS Keychain through Rust and never come back to the UI; "Test connection" lists the provider's models.
  - **Where to get a key:** Settings recommends [OpenRouter](https://openrouter.ai) (free variants and paid models), [OpenCode Zen / Console](https://opencode.ai/console) (paid access from external clients; its free-tier chat models require OpenCode), and local [Ollama](https://ollama.com) / [LM Studio](https://lmstudio.ai) servers (no model API fees). See [AI Assistant](docs/wiki/ai-assistant.md).
- **AI assistant:** use the active provider to request a change on the current page, preview the redacted payload, then accept or reject its validated recipe proposal.
- **Planned:** Android and desktop site views, additional runtime capabilities and sharing. See the [roadmap](docs/wiki/roadmap.md).

## Status

Early, iOS first. Android and desktop site views are not built. Physical-device interaction and authenticated requests to a real AI provider remain unverified. Shell flows use in-memory IPC fixtures for smoke checks; native Swift compilation and Rust tests cover the implementation boundaries. See [Platform Support](docs/wiki/platform-support.md#verified-results).

## Stack

Tauri v2 · Rust · React 19 · TypeScript (strict) · Vite · Tailwind CSS v4 · Zustand · Vitest · a native `WKWebView` host written as an in-repo Tauri plugin (`src-tauri/plugins/tauri-plugin-siteview`).

## Docs

Everything else lives in the [wiki](docs/wiki/index.md): [architecture](docs/wiki/architecture.md), [UI design](docs/wiki/ui-design.md), [recipe format](docs/wiki/recipe-format.md), [security model](docs/wiki/security.md), [platform support](docs/wiki/platform-support.md), [prior art](docs/wiki/prior-art.md).

## Contributing

Read [AGENTS.md](AGENTS.md) first: wiki before code, work in a git worktree, and the architecture invariants (no backend, keys only in Rust, site views are hostile, recipes not code). Changes go through a branch and a pull request, and CI must pass.

## License

[MPL-2.0](LICENSE). See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
