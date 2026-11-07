# Platform Support

> **Status: Partially implemented.** The iOS and Android site-view plugin exists (`src-tauri/plugins/tauri-plugin-siteview`). Only the iOS checks under [Verified results](#verified-results) were run, on one simulator; everything else marked **verify** is still unproven. Desktop is deferred.

## The core constraint

Tauri's multi-webview API (`Window::add_child`) is gated behind the `unstable` Cargo feature and **desktop-only**; upstream tracks mobile support in [#11794](https://github.com/tauri-apps/tauri/issues/11794) and [#11528](https://github.com/tauri-apps/tauri/issues/11528), both open. A mobile app has one Tauri webview, and navigating it to a site would destroy the shell. So:

- **Mobile (iOS, Android) — first-class:** site view = native webview hosted by our own Tauri plugin (`tauri-plugin-siteview`, Swift + Kotlin), positioned over a rectangle the shell reports.
- **Desktop — deferred:** site view = Tauri child webview. The plugin's desktop build returns `DesktopUnsupported` until this is built.

The shell talks to one plugin API (`open`, `set_rect`, `navigate`, …); desktop will implement the same surface ([Architecture](./architecture.md#siteview-rust-two-implementations)).

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
| Priority | 3 | 4 | 4 | **1** | **1** |

iOS and Android first. macOS next (same engine as iOS, fastest desktop path), then Windows/Linux after the engine and format settle; Linux WebKitGTK is the most likely to need per-site workarounds.

## Verified results

Two runs on the iPhone 17 Pro Max simulator (iOS 26.5), both against a local fixture page served over `http://localhost`. The first used a throwaway spike (not kept); the second drove the real app's UI components. The sandbox had no outbound internet, so no real site (Instagram, YouTube) has been loaded. Not verified: a real device, rotation, keyboard, any real site or login, anything on Android.

| Check | Result |
|-------|--------|
| `WKUserScript` at `.atDocumentStart` runs before `<body>` exists | Yes (`readyState: "loading"`, no body) |
| CSS injected at document start hides an element with no flash | Yes: hidden at parse time, at first frame, and for an element inserted after a `pushState` |
| Page → Rust via script message handler and a Rust-created `Channel` (no Tauri IPC on the page) | Works; origin is delivered with the message |
| Site view sees Tauri objects (`__TAURI_INTERNALS__`, `__TAURI__`, `webkit.messageHandlers.ipc`) | No; fetches to `ipc://` and `tauri://` are rejected |
| Native frame equals the rect the shell reported, and follows a resize | Yes |
| Per-profile isolation with `WKWebsiteDataStore(forIdentifier:)` | Yes: a second profile saw no cookie or localStorage; the first kept both. The real app also creates a `WebsiteDataStore/<profile uuid>` directory |
| Real app: add a site, open it, native title and URL reach the shell as `siteview:state` events | Yes |
| Real app: page-initiated navigation enables Back; Back returns to the first page | Yes |
| Real app: `navigate("javascript:alert(1)")` | Rejected in Rust: "only http and https urls can be opened" |
| Real app: page message reaches the shell as `siteview:bridge` with origin `http://localhost`; the page sees no `__TAURI_INTERNALS__` or `ipc` handler | Yes |

**Decisions that follow:**

- **iOS 17 is the minimum.** `forIdentifier:` is iOS 17+, and the Tauri iOS template defaults to 15, so `tauri.conf.json` sets `bundle.iOS.minimumSystemVersion` to 17.0. This resolves the roadmap's open question on older iOS versions.
- **Android requires `WebViewFeature.MULTI_PROFILE` and `WEB_MESSAGE_LISTENER`.** If either is missing, `open` fails with a message asking the user to update System WebView. A silent single-profile fallback would break the profile-isolation invariant.

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
