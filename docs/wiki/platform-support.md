# Platform Support

> **Status: Partially implemented.** The iOS site view exists (`src-tauri/plugins/tauri-plugin-siteview`, Swift). Only the iOS checks under [Verified results](#verified-results) were run, on one simulator; everything else marked **verify** is still unproven. The Android Kotlin code was removed (see the [roadmap](./roadmap.md#decision-log)) and will be rewritten after iOS is stable. Desktop is deferred.

## The core constraint

Tauri's multi-webview API (`Window::add_child`) is gated behind the `unstable` Cargo feature and **desktop-only**; upstream tracks mobile support in [#11794](https://github.com/tauri-apps/tauri/issues/11794) and [#11528](https://github.com/tauri-apps/tauri/issues/11528), both open. A mobile app has one Tauri webview, and navigating it to a site would destroy the shell. So:

- **Mobile (iOS, Android) — first-class:** site view = native webview hosted by our own Tauri plugin (`tauri-plugin-siteview`; Swift today, Kotlin to come), positioned over a rectangle the shell reports. iOS first.
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

Runs on the iPhone 17 Pro Max simulator (iOS 26.5). The first used a throwaway spike (not kept); later ones drove the real app's components, partly against a local fixture page over `http://localhost`. Not verified: a real device, a real finger (gestures below were synthetic pointer events), page scrolling and pinch through the touch router, rotation, keyboard, any login, and anything on Android or desktop.

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
| Real app: a real HTTPS site loads in the native view | Yes: the Reddit mobile site loaded (logged out) when the app restored its last page. An earlier `example.com` attempt failed; the host's own `curl` also failed at that moment, so it was likely a transient network problem, not an app fault |
| Site view below a transparent shell: native hit test sends touches inside reported regions to the shell and everything else to the page | Yes, from a native log: the button's centre went to the shell and the screen centre to the page; with the fan, command bar or an error banner open, the corresponding regions went to the shell |
| Gestures on the floating button (synthetic pointer events through the real components): tap opens the assistant; hold opens the fan; sliding onto a favorite and lifting selects it; lifting then tapping selects it; a drag snaps to the nearer edge and the position persists; sliding onto settings opens it; saving favorites persists to `library.json` | Yes |

**Decisions that follow:**

- **iOS 17 is the minimum.** `forIdentifier:` is iOS 17+, and the Tauri iOS template defaults to 15, so `tauri.conf.json` sets `bundle.iOS.minimumSystemVersion` to 17.0. This resolves the roadmap's open question on older iOS versions.
- **Android must require `WebViewFeature.MULTI_PROFILE` and `WEB_MESSAGE_LISTENER`** (decided, not built). If either is missing, `open` should fail with a message asking the user to update System WebView. A silent single-profile fallback would break the profile-isolation invariant.

## Layout model (mobile)

The site view is a native view *below* the Tauri shell, so the shell's floating controls draw over the page:

- The shell webview is transparent (`isOpaque = false`, clear backgrounds). The shell reserves a full-screen rectangle inside the safe area and reports it with `set_rect`; the native site view fills it.
- A transparent `TouchRouter` view sits above both. The shell reports the rectangles of its interactive elements (`[data-hit]`) with `set_interactive_regions`; a touch inside one goes to the shell, any other touch goes to the page. With no site view open, the shell gets every touch.
- Opening the fan, the command bar or settings adds a full-screen interactive region, so the page cannot be touched underneath them.
- Native gestures (iOS edge-swipe back) stay on the site view; state changes are mirrored to the shell via `siteview:state` events.
- Tap-to-pick, AI chat, and the rule list live in the command bar and settings; the picker highlight lives in the page (engine).

Fallback if the native-plugin approach fails: navigate the main webview to the site and inject shell UI as an overlay in the page. Much weaker (shell dies on navigation, UI shares a realm with the hostile page), so treated as a last resort and not planned.

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
