# Changelog

All notable changes to OpenMedia are documented here.

> **Format**: loosely based on [Keep a Changelog](https://keepachangelog.com/), grouped by date descending. Each entry references the originating PR (when available) and names the area from the conventional-commit prefix.
>
> **Wiki**: the [GitHub Wiki](https://github.com/skepjandi/openmedia/wiki) is the public-facing main wiki — architecture, recipe format, AI pipeline, security model, roadmap. Source-controlled editing surface is `docs/wiki/` in this repo; CI (`.github/workflows/sync-wiki.yml`) mirrors it to the GitHub Wiki on every merge to `main`. New single-PR changes belong here, not as new wiki pages.

## 2026-11-07

### feat(shell): calmer button, favicons, themes, pull-to-refresh, and BYOK provider settings

**What:** The icon and button logo were small, the hold animation was too flashy, a thumb hid the ring, the fan had no site icons, a black bar sat under the page, settings had a confusing icon and no theme, API key or onboarding reset, and the page could not be pulled to refresh.

**Change:** Crop the logo to its artwork for the app icon and the button (the SVG's own `viewBox` had wide margins). The button is 64 px, translucent, with a 40 px logo; holding grows it about 30% and fills a ring outside it (shifted inward at the edge); the halo and hue animation are gone. The fan shows each site's icon, fetched natively from the site itself and cached by host. Remove the bar under the page. Settings is now four sections: Appearance (System, Light, Dark; also sets the site view's color scheme), Favorites, AI assistant, and Guide (Reset onboarding), with a sliders icon. Add native pull-to-refresh. Add BYOK groundwork: provider list with presets (Anthropic, OpenAI, Gemini, OpenRouter, custom), keys written to the Keychain through Rust (`SecretStore` trait over `keyring`) and never returned to the shell, and a connection test that lists models over `reqwest` with no redirects and fixed error messages. Dev builds use line-tables-only debuginfo to keep `target/` small.

**Verified:** on the iOS 26.5 simulator, by eye and through a temporary harness: favicons for three of four sites, a key saved to and removed from the Keychain with no key in the provider JSON or the error, theme and onboarding reset persisting, light and dark settings rendering, the ring staying on screen, and a Reddit video playing inline. **Not verified:** pull-to-refresh, a real provider accepting a key, Instagram's icon, a real device.

**PR:** [#1](https://github.com/skepjandi/openmedia/pull/1)

### feat(shell): logo, hold animation, onboarding, and a Reddit app-prompt recipe

**What:** The button was a plain dot, holding gave no feedback, there was no guide, and Reddit's "Open App" prompts got in the way in the web view.

**Change:** Use `assets/logo.svg` for the app icon (new square master `assets/icon-source.svg`, icons regenerated) and for the floating button, and move the palette to the logo's cyan. Holding fills a ring and pulses a halo whose hue drifts. Add a four-step first-run guide, replayable from Settings (`onboarded` in `library.json`). Add the first slice of the recipe engine in Rust (schema subset, selector and declaration validation, URL matching, CSS compile, one document-start script) and a bundled `reddit.no-app-nag` recipe with a DOM fixture test; the shell now opens pages through the async `open_site` command, and the plugin's `open` is no longer granted to it. Enable inline video playback. Verified on the iOS 26.5 simulator by eye: the Open App button is gone on live Reddit, the logo and hold animation render, and onboarding renders. Not verified: the 30-second blocking modal, inline video, a real device.

**Fix:** the first build of `open_site` was synchronous, which deadlocked the app on the main thread (black screen, no errors). It is `async` now and the rule is in the development guide.

**PR:** n/a

### feat(shell): floating-button UI over a native site view

**What:** The first UI was a home list plus a browser screen with a toolbar; the page was never the whole screen.

**Change:** Replace it with one full-screen page and a draggable, edge-snapping floating button. Tap opens a command bar (addresses; the AI prompt is not connected yet), hold fans out favorites (Instagram, Facebook, Twitter, Reddit by default) with settings set apart, and settings edits the favorites. The native site view now sits below a transparent shell with a native `TouchRouter` and shell-reported interactive regions. Library v2 keeps one hidden profile, favorites and the last page; profiles UI, home/tabs and the Android Kotlin code are removed. Fixes a React crash from an unstable Zustand selector and an invalid `Info.plist` left by an earlier cleanup. Verified on the iOS 26.5 simulator with synthetic pointer events and a native hit-test log; not with a real finger or device.

**PR:** n/a

### feat(shell): iOS-first app foundation

**What:** The repository had docs only.

**Change:** Add the Tauri v2 + React/TS app, a Rust library for profiles and saved sites (`library.json`, atomic writes), the in-repo `tauri-plugin-siteview` (iOS `WKWebView` host with per-profile data stores, state events, http/https-only navigation, a write-only page bridge; Android Kotlin source included but never run), a home view and a browser view, ESLint/Prettier/Vitest/clippy tooling, and `ci.yml`. Verified on the iOS 26.5 simulator against a local fixture only. Desktop site views and Android verification are deferred; iOS 17 is the minimum.

**PR:** n/a

### docs(wiki): mobile-first priorities and corrections

**What:** The wiki ranked macOS as a first platform, overstated the SocialLite comparison, and left the bridge decision open.

**Change:** Make iOS and Android first-class and defer desktop, hedge the SocialLite mechanism claim, label unverified prior-art and advisory claims, record the iOS verification results, and settle the mobile bridge, iOS 17 minimum, and Android profile-isolation requirement.

**PR:** n/a

### docs: bootstrap agent rules, changelog, wiki, and roadmap

**What:** The repository had no contributor guidance, no documentation surface, and a generic Node `.gitignore`.

**Change:** Add `AGENTS.md` (wiki-first, worktree-only, architecture invariants for a no-backend BYOK app), this changelog, the `docs/wiki/` source tree with its sync workflow, and a phased roadmap. Extend `.gitignore` for Tauri/Rust, iOS/Android, signing material, and agent worktrees.

**PR:** n/a (initial bootstrap)

### docs: add logo and README

**What:** The project had no brand mark or README content.

**Change:** Add `assets/logo.svg`, reference it from `README.md` and the wiki index (absolute raw URL there, since relative paths do not resolve in the flattened GitHub Wiki), and plan icon generation in Phase 1.

**PR:** n/a
