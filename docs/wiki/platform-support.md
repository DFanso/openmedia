# Platform Support

> **Status: Design.** Rows marked **verify** are assumptions to be settled by the Phase 0 spikes; results get recorded here and in the roadmap decision log.

## The core constraint

Tauri's multi-webview API (`Window::add_child`) is gated behind the `unstable` Cargo feature and **desktop-only**; upstream tracks mobile support in [#11794](https://github.com/tauri-apps/tauri/issues/11794) and [#11528](https://github.com/tauri-apps/tauri/issues/11528), both open. A mobile app has one Tauri webview, and navigating it to a site would destroy the shell. So:

- **Desktop:** site view = Tauri child webview.
- **Mobile:** site view = native webview hosted by our own Tauri plugin (`tauri-plugin-siteview`, Swift + Kotlin), positioned over a rectangle the shell reports.

Both implement the same Rust `SiteView` trait ([Architecture](./architecture.md#siteview-rust-two-implementations)).

## Matrix

| Capability | macOS | Windows | Linux | iOS | Android |
|------------|-------|---------|-------|-----|---------|
| Webview engine | WKWebView | WebView2 | WebKitGTK | WKWebView | Android System WebView |
| Site view mechanism | Tauri child webview | Tauri child webview | Tauri child webview | Native plugin | Native plugin |
| Document-start injection | `initialization_script` | `initialization_script` (also subframes) | `initialization_script` | `WKUserScript` | `addDocumentStartJavaScript` if supported, else `onPageStarted` (late) |
| Isolated profiles | `data_store_identifier` (**verify** min OS) | `data_directory` | `data_directory` | `WKWebsiteDataStore(forIdentifier:)` (iOS 17+; **verify** fallback for older) | One global `CookieManager` per app; per-profile needs androidx.webkit multi-profile (feature-gated, **verify**) |
| Page → Core channel | Bridge A (**verify**) | Bridge A (**verify**) | Bridge A (**verify**) | Bridge B (script message handler) | Bridge B (web message listener) |
| Secret store | Keychain | Credential Manager | Secret Service | Keychain | Keystore-backed |
| Auto-update | updater plugin | updater plugin | updater plugin | App Store | Play Store |
| Priority | **1** | 3 | 3 | **1** | **2** |

macOS and iOS first (same engine, fastest feedback, and the primary mobile use case). Android second. Windows/Linux after the engine and format settle; Linux WebKitGTK is the most likely to need per-site workarounds.

## Layout model (mobile)

The shell is the Tauri webview; the site view is a native view drawn above it. The shell never overlaps the site view with its own UI; it **resizes** the site rect instead:

- Browser chrome (address/tabs) and the customize sheet are shell UI. When the sheet opens, the shell tells the plugin the new, smaller rect.
- Tap-to-pick, AI chat, and rule list live in the sheet; the picker highlight lives in the page (engine).
- Native gestures (iOS edge-swipe back) are handled by the plugin and mirrored to the shell via events.

Fallback if the native-plugin approach fails Phase 0: navigate the main webview to the site and inject shell UI as an overlay in the page. Much weaker (shell dies on navigation, UI shares a realm with the hostile page), so treated as a last resort and not planned.

## Known platform constraints

- **Android late injection.** Without document-start-script support, injection can run after page scripts. CSS-first rules flash briefly; mitigated by hiding the view until the first inject, and by feature-detecting support (most current WebViews support it).
- **iOS WKWebView isolation.** `WKWebsiteDataStore(forIdentifier:)` requires iOS 17+. Older targets get a single shared store (one profile) unless a fallback is found.
- **Web versions are not native apps.** Mobile web Instagram/Facebook lack features (SocialLite documents: posting, one-time-view DMs, sending video, poll stickers, some music). Our product inherits these limits; communicate them rather than promising parity.
- **No push notifications.** Push for a third-party site needs a server relaying APNs/FCM. Out of scope by design (no backend). Users get in-app unread state only while the app is open.
- **Cannot modify native apps.** iOS forbids altering other apps; Android can only via Accessibility Service (SocialLite's approach). We do neither: we replace the native app with the customized web view. A shell shortcut/URL-handler experience is a possible later step.
- **Background behavior.** A backgrounded site view may be suspended by the OS; do not rely on live observers while hidden.

## Open verifications

Tracked in [Roadmap](./roadmap.md#phase-0--feasibility-spikes). Each needs a recorded result.

| # | Question | Spike |
|---|----------|-------|
| V1 | Does `add_child` + `initialization_script` inject reliably into `https://www.instagram.com` and `https://m.youtube.com` on macOS? | S1 |
| V2 | Can a remote-capability bridge command be scoped to exactly one command per webview label, on desktop and mobile? | S2 |
| V3 | Can the native plugin keep a `WKWebView` / `WebView` aligned to a shell-reported rect through rotation, keyboard, and safe areas? | S3, S4 |
| V4 | Does `addDocumentStartJavaScript` cover subframes and SPA navigations as needed on current Android WebView? | S4 |
| V5 | Per-profile isolation on each platform (see matrix) | S5 |
| V6 | Secret-store options on iOS/Android meet the invariants | S6 |
| V7 | Does Instagram web log in and function in each embedded webview (2FA, passkeys)? | S1, S3, S4 |

## See Also

[Architecture](./architecture.md) · [Site Runtime](./site-runtime.md) · [Security](./security.md) · [Roadmap](./roadmap.md)
