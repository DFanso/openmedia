# Security

> **Status: Design.** This is the threat model and the rules the implementation must meet. Any PR that changes what a site webview can reach must update this page.

## Assets

| Asset | Why it matters |
|-------|----------------|
| LLM API key | Direct financial exposure for the user |
| Site sessions (cookies, storage) | Account takeover on Instagram/Google/etc. |
| Page content in the site view | Private messages, personal feeds |
| Recipes | Integrity: a malicious recipe could hide warnings, mislead, or redirect |
| App-shell IPC | A route from a website into native capabilities |

## Trust boundaries

```
 [Shell: trusted] <--IPC--> [Core: trusted] <--bridge (narrow)--> [Site view: HOSTILE]
                                  |
                            [Secure store]
```

The site view loads third-party code we do not control, and our injected engine shares its JS realm. Assume the page can read and call anything the engine can.

## Invariants

1. **Keys never leave Rust.** Not to the shell, not to a site view, not to logs.
2. **Site views have no general IPC.** No capability grants a site-view webview access to Tauri core, plugins, filesystem, shell, http, or store commands. The shell itself is not granted the plugin's `open`; it opens pages through the app's `open_site`, which attaches the recipe script in Rust.
3. **The bridge is write-only and low-privilege.** The only thing a site view can invoke is "deliver this message to Core", where Core treats it as untrusted data and the message set cannot trigger actions (it can't open files, read keys, or call the LLM).
4. **AI output and imported recipes are untrusted** and validated before use ([Recipe Format](./recipe-format.md#validation-rust-before-anything-reaches-a-webview)).
5. **No `script` rule from AI.** Script rules need explicit per-recipe user confirmation, keyed by content hash.
6. **Profile isolation.** Each profile has its own cookie/storage store. The shell webview has none of their data.
7. **No backend, no telemetry.** The app has no server to leak to; do not add one.
8. **Redact before send; preview by default.**

## The bridge

**Decided for mobile: option B.** Desktop is deferred, and its choice (A or a native channel) stays open. Candidates considered:

| Option | How | Concerns |
|--------|-----|----------|
| **A. Tauri remote-capability IPC** | A capability with `remote.urls` allowing a *single* custom command (`bridge_post`) to site-view webviews | Tauri does not inject IPC into remote URLs by default; this deliberately opens a narrow door. Any script on the page can call `bridge_post`. Mitigate: per-load nonce, per-webview-label capability, message schema validation, rate limiting, command can only enqueue data. Must verify behavior on mobile. |
| **B. Native message channel (mobile plugin)** | `WKScriptMessageHandler` (iOS) and `addWebMessageListener` with origin rules / `addJavascriptInterface` (Android), owned by our plugin | Strongest control; no Tauri IPC on the page at all. Android `addJavascriptInterface` exposes to all frames unless using `addWebMessageListener` with origin allowlist. |
| **C. Custom URI scheme / navigation interception** | Engine navigates or fetches a private scheme that Core intercepts | Page CSP (`connect-src`, `navigate-to`) can block it. Fragile. |

Direction: **B on mobile**, implemented in `tauri-plugin-siteview`. A native message handler (`WKScriptMessageHandler` on iOS, `addWebMessageListener` on Android) hands each message to a Rust-created `Channel`; Rust parses it with a 64 KiB cap and forwards it as the `siteview:bridge` event. The site webview is a separate native webview with no Tauri IPC. Verified on the iOS simulator: the page sees no `__TAURI_INTERNALS__`, no `ipc` message handler, and fetches to `ipc://` and `tauri://` fail. Android is not yet verified. For desktop, A is only acceptable if it can be scoped to one command with a nonce; otherwise desktop adopts a native channel too. Either way, invariant 3 holds.

Tauri has reportedly had an advisory where remote-origin iframes could reach IPC without being explicitly allowed (GHSA-57fm-592m-34r7) **[not verified; look it up before relying on this]**. Pin to a patched Tauri and treat IPC scoping as a regression-test target: an integration test must prove a site view **cannot** call a non-bridge command. Today that proof is the iOS simulator check above; an automated on-device test does not exist yet.

## Key storage

- **Built (iOS):** an in-repo `SecretStore` trait (`src-tauri/src/secrets.rs`) with a `KeychainStore` on the `keyring` crate (v3, `apple-native`) and an in-memory store for tests. Items use service `dev.openmedia.app` and account `ai-provider:<provider id>`.
- **How a key moves:** the shell sends it once to the `ai_set_key` command, which validates it and writes it straight to the store. No command returns it; the shell only learns `hasKey`. Provider settings (name, kind, base URL, model) are in `library.json`, which never contains a key (tested). Deleting a provider deletes its key.
- **Where it is read:** only in the `ai_test` command today, to call the provider's `/models` endpoint from Rust. The request disables redirects (a redirect could carry a custom auth header to another host), builds no URL containing the key, and maps failures to fixed messages that never include a header or body. Base URLs must be HTTPS, or HTTP to this device for local models, with no credentials, query or fragment.
- **Known gap:** the shell never receives a masked tail of the key (the design page proposed one). Showing a tail would mean reading the key for display, so the UI shows "Key saved" only. The request spec holds the key as a plain `String` for the duration of one call; the stored copy is zeroized after use.
- Desktop (Keychain / Credential Manager / Secret Service) and Android (Keystore-backed) are not built. The third-party Tauri plugins for this (`tauri-plugin-keyring` and others) were not adopted; the in-repo trait keeps that choice open.
- Optional biometric gate to *reveal/replace* the key (not required for use). Not built.
- Backups: ensure the secure-store item is excluded from cloud backup where the platform allows.

## Recipes as an attack surface

Even without scripts, a recipe can mislead (hide a security warning, hide a "this is not the real site" banner, redirect within origin). Mitigations: schema validation; no cross-origin redirect; broad `match` patterns refused for AI/imported recipes; imported recipes get a rule-by-rule review; recipes apply only to URLs they `match`, and the address/origin indicator is in shell UI the site cannot touch.

Shared community recipes (Phase 5) are static files from a GitHub repo. Integrity: pinned commit hash or signed index, shown author, and review UI before first apply. No dynamic server.

## Ad blocking

Blocking uses WebKit content rule lists attached to the site view's `WKUserContentController` ([Ad Blocking](./ad-blocking.md)). It adds no path from a site to native code:

- The rules run inside WebKit, outside the page's JS realm; a page cannot read, list or remove them.
- The site view gets no new message, event or capability. The plugin commands that swap the lists (`set_content_rule_lists`) and the document-start script (`set_document_start_script`) are registered but absent from `siteview:default`, like `open` and `fetch-favicon`; only Rust calls them. The script is compiled in Rust from bundled recipes and the user's saved toggles; the shell can change a toggle (`set_site_option`, which validates the recipe and option ids) but never supplies script text. It takes an id and an absolute `.json` path produced by Rust, and the plugin re-validates both (`validate_rule_lists`).
- The filter lists are compiled into the binary and never downloaded, so invariant 1 (no new network destinations) holds. Lists change only with an app release.
- A blocking failure is shown to the user and the page still loads unblocked; it never silently pretends to block.

## Privacy

- The snapshot is the only page-derived data that leaves the device, only on explicit user action, only to the endpoint the user configured. See [AI Assistant](./ai-assistant.md#privacy-what-is-sent).
- The app never reads site credentials. Users log in to the real site inside the view.
- App logs are local, scrubbed, and never include page content, URLs with query strings, or keys.

## Legal and store-policy risks (not code, but they shape scope)

| Risk | Notes | Posture |
|------|-------|---------|
| **Site Terms of Service** | Platforms may object to modified clients. We alter only the user's own rendering of their own session; we do not scrape, automate, or act for the user (invariant 7). | Customization only. Keep it that way. |
| **App Store review (iOS)** | Web-wrapper apps risk rejection for "minimum functionality". SocialLite ships on the App Store with the same core mechanism ([Prior Art](./prior-art.md)), which suggests it is approvable when the app adds real native functionality (profiles, recipes, AI editor, picker). | Make the native value obvious; confirm against current guidelines before submission. [INFERENCE] |
| **"Sign in with Google" in embedded webviews** | Google blocks OAuth in embedded browsers (`disallowed_useragent`). Sites that only offer Google sign-in may not be loggable-in. | Document as a known limitation; consider system-browser auth handoff for specific flows later. Do not spoof user agents by default. |
| **Anti-bot / fingerprint heuristics** | Unusual webviews may trigger challenges. | Use the platform webview unmodified; no stealth tricks. |
| **Play Store policy** | Generally permissive for webview apps; no Accessibility Service use planned. | Avoid the Accessibility route SocialLite uses on Android. |

## Reporting vulnerabilities

Add `SECURITY.md` with a private contact before first public release (Phase 6).

## See Also

[Architecture](./architecture.md) · [Site Runtime](./site-runtime.md) · [AI Assistant](./ai-assistant.md) · [Platform Support](./platform-support.md)
