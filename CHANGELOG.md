# Changelog

All notable changes to OpenMedia are documented here.

> **Format**: loosely based on [Keep a Changelog](https://keepachangelog.com/), grouped by date descending. Each entry references the originating PR (when available) and names the area from the conventional-commit prefix.
>
> **Wiki**: the [GitHub Wiki](https://github.com/skepjandi/openmedia/wiki) is the public-facing main wiki — architecture, recipe format, AI pipeline, security model, roadmap. Source-controlled editing surface is `docs/wiki/` in this repo; CI (`.github/workflows/sync-wiki.yml`) mirrors it to the GitHub Wiki on every merge to `main`. New single-PR changes belong here, not as new wiki pages.

## 2026-11-08

### feat(stats): on-device usage stats sheet

**What:** There was no way to see how much time goes to which site or to which part of it (Shorts, Reels, Watch).

**Change:** A Stats button in the fan, directly above History, opens a sheet with Today / 7 days / 30 days, total time, per-site time with bars and, per site, time per first-path-segment area (`/watch`, `/shorts`; handles and ids are filed as Other, the root as Home). The shell counts foreground seconds (`features/stats`) and flushes batches to Rust (`record_usage`, `get_usage`, `clear_usage`), which keeps them in `usage.json` (30 days, capped, validated). Nothing leaves the device; only site names, section names and seconds are stored; "Clear stats" wipes it. See [UI Design](docs/wiki/ui-design.md#stats) and [Security](docs/wiki/security.md).

### fix(siteview): no white or black flashes, no blocked first page

**What:** Cold start, opening a page and the first launch after an install showed a blank white or black screen, up to 7 s.

**Change:** Themed launch screen and a themed backdrop under every page; a new page is shown only after it paints (fade-in); `open` no longer waits for content rule lists to compile (they attach later without a reload) and Rust converts them at launch; the splash waits for the first page. On the simulator, unthemed frames went from 1.5-8 s to none (before/after table in [Platform Support](docs/wiki/platform-support.md#verified-results)), and scroll, inertia, pull-to-refresh, long-press, keyboard, button drag and sheet scrolling were checked there; pinch, hold-slide-lift and edge-swipe back were not.

## 2026-11-07

### fix(ui): reduce app icon padding

**What:** The padded icon master left too much empty space around the logo.

**Change:** Scale the logo in `assets/icon-source.svg` from 62% to 86% of the square and regenerate the platform icons.

### feat(ui): new logo, padded app icon, draggable back button

**What:** The logo was replaced; the app icon needed more padding and the optional back button was pinned to the bottom instead of floating.

**Change:** Update `assets/logo.svg`, regenerate `assets/icon-source.svg` (logo at 62% of a 1024 square) and all platform icons, and use the new mark for the floating button and first-run guide. The back button is now draggable, snaps to the nearer edge and remembers its position (`om.back`).

### feat(app): splash screen while the shell loads

**What:** The webview showed a black screen until the JS bundle booted and app state loaded.

**Change:** `index.html` paints a themed splash (logo mark on the ink background) before any script runs; `App` fades it out once `load()` settles (`src/app/splash.ts`). Large logo with pop-in, float and expanding-ring animations; honors `prefers-color-scheme` and reduced motion. Dev builds can set `VITE_SPLASH_MIN_SECONDS` (see `.env.example`) to keep the splash visible for a minimum time; ignored in production builds.

**Verified:** TypeScript, ESLint, Prettier and 94 frontend tests pass. **Not verified:** on-device iOS/Android cold start.

### feat(settings): free and paid model recommendations for BYOK

**What:** The AI assistant settings gave no hint where to get a key or which providers have free models.

**Change:** Add a recommendations card with provider websites (OpenRouter, OpenCode Zen / Console, local Ollama or LM Studio) and an OpenCode Zen preset. Distinguish free variants, paid usage and local hosting; note that OpenCode's free-tier chat models are not available to external clients. Update the AI assistant wiki page and README.

**Verified:** TypeScript, ESLint, Prettier and all 94 frontend tests pass in the feature worktree. Browser smoke at 390px with in-memory app/AI state: recommendation text, no horizontal overflow, and selecting Zen fills its name and URL. Provider terms and URL checked against official docs; the model-list endpoint returned HTTP 200. **Not verified:** native/on-device rendering or authenticated model generation.

**PR:** [#13](https://github.com/skepjandi/openmedia/pull/13)

### feat(recipes): options for 13 more platforms, update-safe forks, and a catalog of the 20 largest platforms

**What:** Only five sites had switches in Settings, a changed recipe would have been overwritten by the next app update, and any other platform meant typing its address.

**Change:** (1) Settings > Favorites gains "Popular platforms": the 20 largest social platforms, name only, each with an Add/Added toggle that edits the favorites list (up to 6) before the existing Save; matching is by domain, so an old `twitter.com` favorite shows X as added. Addresses were probed with a mobile Safari user agent (Threads moved to `threads.com`). (2) New bundled recipes with plain-English switches under Settings > Sites for Threads, Telegram, Douyin, Messenger, Discord, Kuaishou, LinkedIn, WhatsApp, Snapchat, Pinterest, Weibo, TikTok and Twitch (annoyances such as install sheets, sign-in pop-ups and cookie bars default ON; suggestions, comments, counters and similar default OFF). WeChat and QQ have none: their logged-out pages offer nothing to hide. (3) Forks: a changed copy of a bundled recipe is saved in `<app_data>/recipes/<id>.json` with the same id and `forkedFrom`, replaces the bundled one while it exists, and survives app updates; Settings marks it and offers "Restore the original". New Rust commands `save_recipe_fork` (validated, origin user/ai) and `restore_recipe_original`; the recipe store is now `Recipes::load(dir)`.

**Verified:** Rust tests for fork save, replace, reload after restart, restore, refusals (bundled/imported origin, unknown id, invalid selector, oversize writes nothing), damaged fork files ignored, and the site listing flags (`customized`, `originalUpdated`); every new rule matches its DOM fixtures and no `hide` rule touches a `data-keep` element (existing fixture tests); catalog unit tests. Selectors were counted on the real logged-out pages in headless Chromium with an iPhone user agent, except LinkedIn, whose counts come from the server-rendered HTML fetched with curl. **Not verified:** any logged-in selector; WebKit rendering and the switches on a simulator or device; `save_recipe_fork` has no UI caller yet (the assistant's accept step will call it); Kuaishou and Douyin were reached only from a non-China network; TikTok's cookie rule, Twitch's ad slot and Discord's recipe are thin or best-effort.

**PR:** n/a

### fix(siteview): sign-in popups and a Safari user agent

**What:** On the iPhone 17 Pro Max simulator, Reddit's Continue with Google did nothing, and Continue with Apple's popup was loaded over the page or dropped.

**Change:** Pages that call `window.open` (Google and Apple sign-in) now get a real popup view above the site view, sharing its data store, closed when the page closes it; link clicks with `target=_blank` still load in the page. `javaScriptCanOpenWindowsAutomatically` is on. The site view and popups report a Mobile Safari user agent (with a `Safari` token) instead of WebKit's default, which Google treats as an embedded browser.

**Verified:** on the simulator, Reddit's Log In sheet: Continue with Apple opened its popup (`createWebView` logged), Continue with Google opened "Choose an account" with the already signed-in Google account, and choosing it logged Reddit in (header shows the account and notifications). Reddit's Open App button was gone in the same build. **Not verified:** other sign-in flows, that the new user agent changes nothing on Instagram, Facebook and X, a physical device.

**PR:** n/a

### feat(recipes): per-site options for the default favorites, bottom margin, favorites only in Settings

**What:** The five default sites could only be customized by editing code, Reddit's prompt removal could not be turned off, and the command bar could add to the favorites while browsing.

**Change:** Recipes gain `options` (named switches) and a per-rule `option`; annoyances default on, content off (tested). Bundled recipes for Instagram, Facebook, X (Twitter), Reddit and YouTube, one switch per thing worth hiding (Reels, Shorts, Stories, suggested posts, all posts, app prompts, sign-in pop-ups, Premium upsells, promoted posts, Grok, comments, related videos and more). Settings gets a Sites section with a card per site, a shared Bottom margin slider and a per-site override. Choices persist as overrides in `library.json` (no migration). `set_site_option` recompiles the script and the new plugin command `set_document_start_script` swaps it and reloads; it is Rust-only, not granted to the shell. The bottom margin shrinks the native view; Rust resolves which site a URL belongs to. The command bar's "add this page to favorites" button is removed. New wiki page `site-playbooks.md` records what every selector matched (`LIVE`, `SOURCE` or `INFERRED`), pitfalls, what CSS cannot do, and selector-writing rules for the in-app assistant.

**Verified:** Rust tests for option defaults, saved choices, per-site script compilation, matcher-based site lookup, margin bounds and persistence, and old library files loading; DOM fixtures for every rule, plus a check that no `hide` rule touches elements a fixture marks `data-keep`. Selectors were run against the real logged-out pages with an iPhone user agent in Chromium. The Swift plugin compiles for the iOS Simulator SDK. **Not verified:** any logged-in selector (Instagram feed, Stories and suggested posts; Facebook Stories; X premium, promoted and Grok rules; YouTube promos and ads); WebKit rendering; the switch, reload and margin on a device or simulator.
### feat(siteview): live sessions, domain pinning with a popup browser, and history

**What:** Opening a site closed the one before it, and going back to it reloaded it. A page could navigate away from its own domain. Favorites in the fan had solid white tiles.

**Change:** Every opened site is now a session, its own native view kept alive under the visible one. A favorite switches to its live session without reloading; a typed address always opens a new session, so a favorite's is never replaced. The shell closes hidden sessions that sit idle for 20 minutes, beyond a cap of 5 (typed before favorite, oldest first), or all of them on an OS memory warning. A session is pinned to its registrable domain: outside links, `target=_blank` and `window.open` open in an `SFSafariViewController` popup and the session stays put (redirects during the first load may still move the domain, e.g. `twitter.com` to `x.com`). New History button in the fan, directly above settings, lists typed addresses (newest first, up to 100); Settings has a confirmed "Clear history", which also forgets the last page. Library format v4 adds `history` and reads v2 and v3 files. Fan items now use the button's clear glass. Plugin API: `open` takes a `session`, new `activate` and `close(session)`, state events carry `session` and `scope`, new `siteview:closed` and `siteview:memory` events. [Security](docs/wiki/security.md#sessions-and-the-popup-browser), [UI Design](docs/wiki/ui-design.md#sessions) and [Platform Support](docs/wiki/platform-support.md) are updated.

**Verified:** unit tests for the session policy, history, fan geometry and the v3 to v4 migration; `scripts/test-domain-scope.sh` for the Swift domain rules. On a throwaway iOS 26.5 simulator against a local request-logging server: a live favorite and a live history entry switched with no new request; an external link and a `target=_blank` link opened the popup without moving the session; a closed (evicted) history entry reloaded; a posted memory warning (temporary hook, removed) closed hidden sessions; Clear history left `history: []` and `lastUrl: null` with favorites intact. **Not verified:** a physical device, the real Simulator memory-warning menu, the 20-minute idle sweep end to end, a dying web content process, and CPU. iOS gives this app no per-page CPU or memory figure [INFERENCE], so "too heavy" is bounded by idle time, count and memory warnings, not measured. Cross-domain sign-in (for example Google) now happens in the popup and cannot hand its cookies back to the session.

**PR:** n/a

### docs: MPL-2.0 license and open-source community files

Area: `docs`. Adds `LICENSE` (MPL-2.0), `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, issue/PR templates, Dependabot config, and license metadata in `package.json` and `Cargo.toml`.

### feat(shell): optional floating back button

**Change:** Some sites have no back control. Settings gets a "Back button" switch (default off, persisted as `backButton` in `library.json`; older files load with it off). When on, a floating button appears on the edge opposite the main button whenever the page `canGoBack`, and calls the existing `go_back` siteview command. New `set_back_button` app command; no native or capability changes.

**Verified:** `cargo test library` (default off, persistence), `ts:check`, `lint`, `format:check`, `vitest`. Not verified: on-device appearance and touch pass-through of the new hit region.

**PR:** n/a

### feat(shell): button-edge hold ring and YouTube favorite

**Change:** Keep the progress ring on the floating button's border instead of outside it, and remove the inward jump during a hold. Update the onboarding illustration to match. Add YouTube as the fifth default favorite; library v3 upgrades v2 files with the original four defaults without changing their IDs, and leaves customized lists and later removals alone.

**Verified:** browser geometry checks: the ring and button bounds match at rest (64 px) and during hold (83.2 px), without shifting the button's center. On the iOS 26.5 simulator, a native long press opened the fan and tapping YouTube navigated to `https://m.youtube.com/`. Physical-device appearance remains unverified.

**PR:** n/a

### feat(siteview): ad and tracker blocking from bundled EasyList and EasyPrivacy

**What:** Pages loaded every ad and tracker the site served.

**Change:** Add Brave's `adblock` crate (MPL-2.0) to convert `blocklists/easylist.txt` and `easyprivacy.txt` (compiled into the binary; no downloads) to WebKit content rule lists. `src-tauri/src/ad_block.rs` writes the JSON once per list version to the app cache; `tauri-plugin-siteview` looks each list up in `WKContentRuleListStore` by id, compiles it only on a miss, attaches it to the site view and removes stale ones. `open_site` passes the lists; the new `set_ad_block` command (and a Settings switch, default on) swaps them on the open page and reloads. Bare `if-domain` entries from the converter get a `*` prefix because WebKit matches them against the exact host only. A failure to build or compile the lists opens the page unblocked and shows a banner. See [Ad Blocking](docs/wiki/ad-blocking.md).

**Verified:** on the iOS 26.5 simulator against a local fixture page: Google Analytics and AdSense scripts blocked, the page's own script loaded, an `#ad_banner` element hidden; the switch off then on reloaded the page loaded-then-blocked (driven by timers in a temporary patch, not by tapping the switch); a changed list replaced the stored one; a list WebKit rejected left the page loading, the other list blocking, and a banner shown. **Not verified:** a physical device, real sites' look and breakage, cold-compile time on a device. Not built: Android, desktop, a per-site allowlist.

**PR:** n/a

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
