<p align="center">
  <img src="https://raw.githubusercontent.com/skepjandi/openmedia/main/assets/logo.svg" alt="OpenMedia logo" height="96">
</p>

# OpenMedia Wiki

> Project knowledge base for contributors and AI agents. All pages are automatically synced to the [GitHub Wiki](https://github.com/skepjandi/openmedia/wiki) on every merge to `main`.

**Project status: Design.** No application code exists yet. Pages marked `Status: Design` describe the intended system; the PR that implements a piece flips its banner to `Implemented` and replaces intent with fact.

## What OpenMedia is

A Tauri v2 app for desktop and mobile that loads any website in an embedded webview and lets you reshape it. Remove Instagram Reels, strip YouTube Shorts, hide any element on any site. Customizations are declarative **recipes**. Popular sites ship with bundled recipes; for any other site, an AI assistant writes the recipe from a plain-language request using an API key you provide. No backend, no accounts, no telemetry.

## Pages

| Page | Description |
|------|-------------|
| [Architecture](./architecture.md) | Components, data flow, tech stack, planned repository layout |
| [Recipe Format](./recipe-format.md) | The declarative customization format: targets, rules, matching, versioning, trust levels |
| [Site Runtime](./site-runtime.md) | The injected page script: injection timing, SPA navigation, picker, snapshot, health reporting |
| [AI Assistant](./ai-assistant.md) | BYOK providers, snapshot redaction, structured generation, repair loop |
| [Security](./security.md) | Threat model, invariants, IPC boundary, key storage, legal and store-policy risks |
| [Platform Support](./platform-support.md) | Desktop vs iOS vs Android: what works, what needs a native plugin, open verifications |
| [UI Design](./ui-design.md) | The floating-button interface: tone, tokens, gestures, layering, what is and is not connected |
| [Site Playbooks](./site-playbooks.md) | Per-site options for the default favorites, what every selector matched and how it was checked, what CSS cannot do, and the selector-writing rules for the in-app assistant |
| [Internationalization](./i18n.md) | 29 UI languages, message catalog, plurals, right-to-left, adding a language |
| [Ad Blocking](./ad-blocking.md) | Bundled EasyList and EasyPrivacy as WebKit content rule lists: engine choice, caching, limits |
| [Prior Art](./prior-art.md) | SocialLite and others: what they do, what we copy, where we differ |
| [Roadmap](./roadmap.md) | Phased build plan with exit criteria, spikes, decision log, risks |
| [Development Guide](./development-guide.md) | Planned toolchain, commands, conventions |

## Quick Start

Not runnable yet. The planned commands are in the [Development Guide](./development-guide.md); Phase 1 of the [Roadmap](./roadmap.md) creates the scaffold.

## AI Agent Note

If you are an AI agent modifying this repository, read [Architecture](./architecture.md) and [Security](./security.md) before making significant changes, and find the current phase in the [Roadmap](./roadmap.md). See `AGENTS.md` for the wiki-first rule and the architecture invariants.

## Documentation Philosophy

- **For contributors:** `docs/wiki/` is the source of truth; `CHANGELOG.md` records individual changes.
- **For AI agents:** names, paths, and schema fields are precise. Intent is labelled as intent.
- **Wiki sync:** edit `docs/wiki/*.md` and open a PR. `.github/workflows/sync-wiki.yml` mirrors changes to the GitHub Wiki.

## See Also

- [GitHub Wiki](https://github.com/skepjandi/openmedia/wiki)
- [CHANGELOG.md](../../CHANGELOG.md)
- [AGENTS.md](../../AGENTS.md)
