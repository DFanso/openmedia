# UI Design

> **Status: Implemented on iOS.** Source lives in `src/` (`features/fab`, `features/sheet`, `features/settings`, `features/onboarding`, `features/web`). Gestures were exercised with synthetic pointer events, not a real finger; see [Platform Support](./platform-support.md#verified-results).

## Idea

The web is the product. The screen is one full-bleed page, from under the status bar to the bottom edge (no bar below it); everything else is a single floating button that stays out of the way. The button is the logo.

| Gesture | Result |
|---------|--------|
| Tap the button | Command bar slides in from the top. Type an address to open it. The AI prompt lives here too, but is **not connected yet** (see below) |
| Hold the button (about 380 ms) | The button grows about 30% and a thin progress ring fills along its edge; then the favorites fan out on an arc, with stats, history and settings tucked apart in the edge column above or below (settings at the bottom of the stack, history directly above it, stats directly above history) |
| Hold, slide onto an item, lift | Opens that favorite, stats, history, or settings |
| Hold, lift, then tap an item | Same, in two steps |
| Drag the button | Moves it; on release it snaps to the nearer left or right edge and remembers its place |
| Pull the page down from the top | Native pull-to-refresh (`UIRefreshControl`); only where the page's own scroll view is at the top |

Defaults: Instagram, Facebook, Twitter, Reddit, YouTube. Each fan item shows the site's icon when one is known, otherwise a monogram, on clear glass. The command bar also has back, forward and reload. Favorites change only in Settings: the command bar has no "add this page" button, so browsing never alters the list.

## Settings

Eight sections in one scrolling screen (the settings glyph is a sliders icon):

- **Appearance:** System, Light or Dark. Stored in `library.json` and applied to the app and, through the native view's `overrideUserInterfaceStyle`, to sites that follow `prefers-color-scheme`.
- **Ad blocking:** a global switch for the bundled EasyList and EasyPrivacy rules; changing it reloads the open pages.
- **Sites:** one collapsible card per bundled recipe (18: Instagram, Facebook, X (Twitter), Reddit, YouTube, Threads, Telegram, Douyin, Messenger, Discord, Kuaishou, LinkedIn, WhatsApp, Snapchat, Pinterest, Weibo, TikTok, Twitch). Each card lists its options as switches, annoyances first and then content, each with a one-line description. A switch ON means the thing is hidden. Annoyances (install prompts, pop-ups that block the page, ad slots) start ON; content (Reels, Shorts, Stories, suggestions, whole feeds) starts OFF. Changing a switch saves it and reloads the open page under the recompiled recipe script. The card also holds the site's bottom margin; a site that runs on the user's own changed copy of its recipe (a [fork](./recipe-format.md#forks)) says so and offers "Restore the original". See [Site Playbooks](./site-playbooks.md) for what each option covers.
- **Bottom margin:** a slider (0 to 200 px, saved when released) that keeps the bottom of every page clear, for sites whose menus slide under the screen edge. A site card can override it; "Use the shared margin" removes the override. The shell asks Rust which site the current page belongs to (`bottom_margin_for`) and shrinks the native view's rectangle from the bottom; the strip underneath shows the app background.
- **Favorites:** edit name and address, reorder, remove, add (up to 6). Saved with its own button. Below the list, **Popular platforms** shows the 20 largest social platforms by monthly users (Facebook, Instagram, WhatsApp, YouTube, TikTok, WeChat, Messenger, Telegram, Snapchat, Reddit, Kuaishou, Douyin, QQ, X, Pinterest, Weibo, Threads, LinkedIn, Discord, Twitch), one row per platform with just its name and an Add/Added toggle. Toggling edits the unsaved list above, so the same save button persists it; Add is disabled when the list is full. A favorite counts as added when its host is the platform's domain or a subdomain (an older `twitter.com` favorite shows X as added). The catalog is `src/features/settings/platforms.ts`; each address is one a mobile Safari user agent reaches without leaving its domain, since a session stays pinned to the domain it settles on. WeChat and QQ have no recipe (their logged-out pages offer nothing to hide); the other 18 platforms have one, so their switches appear under Sites.
- **History:** "Clear history" (with a confirm step) empties the searched addresses and forgets the last page, like a browser. Favorites, open sessions and logins are untouched.
- **AI assistant:** bring-your-own-key providers. See [AI Assistant](./ai-assistant.md#implemented-provider-settings).
- **Guide:** "Reset onboarding" marks the first-run guide unseen and shows it again.

## Stats

The stats button (bars icon) sits at the top of the edge column, directly above history. It opens a full-screen sheet with a Today / 7 days / 30 days switch (7 days by default), the total time on sites for the period, and one row per site, busiest first, with a bar. Tapping a site expands the parts of it that were used, again busiest first, each with a bar. A site's name comes from the bundled recipe that covers it, else from a favorite on that domain, else it is the host (for example `youtube.com`).

- **What counts.** Seconds while the app is in the foreground (`document.visibilityState`), a site page is the active page, and no sheet or the guide is in front of it. The shell ticks every 5 s and on every page, sheet, hide or focus change; each step is credited at most 10 s, so a suspended app never banks its sleep. Seconds are written to Rust in batches (about every 30 s, and whenever the user leaves a page). The logic is pure and unit-tested (`features/stats/accumulator.ts`).
- **Sites** are keyed by the session's registrable domain (`scope`), so `m.youtube.com` and `www.youtube.com` are one row.
- **Sections** come from the first path segment of the page address only, generic for every site: `/watch`, `/shorts`, `/reels`, `/explore`, `/messages` show as Watch, Shorts, Reels, Explore, Messages. A segment is kept only when it is 1-24 characters of `a-z 0-9 _ -` (lowercased) and not all digits; an empty path is **Home**, and anything else (a `@handle`, an id, non-Latin text) is **Other**. Rust validates the same rule again.
- **Privacy statement** (shown on the sheet): this information stays on this phone and is never sent anywhere; OpenMedia has no server and keeps no copy; only site names, section names and seconds are stored, never full addresses, searches or page titles. **Clear stats** (with a confirm step) wipes it.

## History

The history button sits in the fan directly above settings, and the stats button directly above it. It opens a full-screen list of the addresses the user typed, newest first, up to 100, one line for the site and a faint second line for the path. A repeat moves to the top. Tapping an entry follows the [session](#sessions) rules above.

## Onboarding

A four-step full-screen guide shows on first launch. Whether it has been seen is stored in `library.json` (`onboarded`). Each step has a looping illustration and a short line:

1. **The web, minus the noise.** What the app is, and that it hides things like app prompts.
2. **One button.** Tap to go to an address; the AI assistant is described as "soon".
3. **Hold for favorites.** An animated fan pops out of a pulsing button; settings sits apart.
4. **Make it yours.** Drag to either edge; change favorites in Settings.

It can be skipped at any step. Under `prefers-reduced-motion` the illustrations stay still.

## Aesthetic brief

- **Tone:** brutally minimal. One translucent control over the page, hairline borders, one accent.
- **Button:** 64 px, clear glass with a faint white gradient, bright rim and inner highlight; no backdrop blur. The logo stays at 40 px. A thin progress ring hugs the border during a hold; the button stays anchored at its normal edge position.
- **Fan items:** the favorites, stats, history and settings use the same clear glass as the button (`.fab-glass`), with no solid or white background. Icons and monograms are white over the dimmed page.
- **Color:** from the logo (`assets/logo.svg`): cyan `#06aff8` accent, navy `#021669`, and ink/paper tokens. The light theme swaps the same tokens on `<html data-theme="light">`, so components do not know which theme is active. Text on the accent is a fixed dark (`--color-on-accent`) so it reads in both. Fan labels are always white with a shadow, because they sit on the dimmed page.
- **Type:** Schibsted Grotesk (variable), bundled through `@fontsource-variable/schibsted-grotesk`. No CDN: the app makes no third-party requests. Tabular figures for addresses.
- **Motion:** the hold ring and the fan (spring out, staggered about 35 ms, folds back in reverse). Everything else is a plain ease. `prefers-reduced-motion` removes the stagger.
- **Layout:** asymmetric and edge-hugging. Nothing is centered except onboarding.

Tokens are in `src/index.css` (`@theme`).

## Logo and icons

`assets/logo.svg` is the source and is not edited. Its own `viewBox` has wide built-in margins, so two derived files crop to the artwork:

- `assets/icon-source.svg`: a square 1024 master (artwork about 78% of the width, centered, on white) used by `yarn tauri icon assets/icon-source.svg` to generate every platform icon (`src-tauri/icons/`, `src-tauri/gen/apple/Assets.xcassets`).
- `src/assets/logo-mark.svg`: the same paths with a tight `viewBox`, so it scales uniformly inside the button and onboarding.

## Favicons

Each favorite's icon is fetched natively from the site itself, never from an icon service: the page's `<link rel="…icon">` tags (touch icons first), then `/apple-touch-icon.png` and `/favicon.ico`. Only a decodable image under 400 KB is accepted, and it is re-rendered as a 96 px PNG. Rust caches the result by host in `library.json` as a `data:` URL, and only accepts PNG data URLs under 200,000 characters. The fetch runs when the app starts and after favorites change.

## Sessions

Every site the user opens is a **session**: its own native web view, kept alive underneath the one that is visible. Opening something never closes or reloads what was already open.

| User action | Result |
|-------------|--------|
| Tap a favorite | Switches to the live session on that favorite's site if there is one (no reload, scroll and form state kept); otherwise opens a new session |
| Type an address in the command bar | Always a new session, so a favorite's session is never replaced. The address is added to history |
| Tap a history entry | Switches to the live session typed with exactly that address; otherwise opens a new one |
| Tap a link to another domain, or a `target=_blank` / `window.open` to one | The session stays where it is; the page opens in a popup browser (see below) |

**A session never leaves its domain.** Each session is pinned to the registrable domain of its address (`www.instagram.com` and `m.instagram.com` are both `instagram.com`; a short built-in list handles `co.uk`-style suffixes instead of the full public suffix list). A main-frame navigation outside it is cancelled and shown in a popup browser, an `SFSafariViewController` presented over the app, with its own Close button. The popup shares nothing with the profile's cookies or recipes. One popup at a time. Until a session's first load finishes, redirects may change its domain (`twitter.com` to `x.com`) and the session adopts the final one. Subframes (ads, embeds) are not blocked. Same-domain `target=_blank` loads in place.

**Which sessions stay alive.** The shell (`features/web/sessions.ts`, unit-tested) closes hidden sessions, never the visible one, when:

- one has been hidden for more than 20 minutes;
- more than 5 are alive: typed and restored sessions go before favorite sessions, oldest first;
- the OS sends a memory warning: every hidden session goes.

A hidden session whose web content process dies is dropped natively and the shell is told. Reopening anything that was closed starts it fresh. A sweep runs every minute and after each open or switch. Startup restores the last page; if it is on a favorite's site it counts as that favorite's session.

## How it works

- **Layering.** The native site view is *below* the transparent shell, so the button draws over the page. A native `TouchRouter` sends a touch to the shell inside the rectangles the shell reports (`[data-hit]` elements), and to the page everywhere else. Details: [Platform Support](./platform-support.md#layout-model-mobile).
- **Gesture logic** is a pure state machine (`features/fab/gesture.ts`) and the layout math is pure (`features/fab/geometry.ts`), both unit-tested. The fan layout searches rotations, side flips and a compacting arc until every item fits on screen, for 0 to 6 favorites at any height; the edge column holds settings, history and stats.
- **Persistence.** Favorites, history, the last page, theme, icons, provider settings and the onboarding flag are in `library.json` (Rust). Library format v4 adds `history` and reads v2 and v3 files; v2 files also get YouTube appended, but only if the saved favorites still exactly match the original four defaults. Customized lists are unchanged, and removing YouTube after the upgrade is respected. Time on sites is in a separate `usage.json` next to it (see [Stats](#stats)): local `YYYY-MM-DD` -> host -> section -> seconds, written atomically, pruned to the last 30 days and capped (200 hosts per day, 60 sections per host, 3600 s per write); a corrupt file starts empty. Commands `record_usage`, `get_usage` and `clear_usage` are shell-only. The button position is a UI preference in `localStorage`, as a fraction of height so rotation keeps its place.

## Not connected yet

- **AI assistant.** The prompt box accepts addresses only. Typing a request shows "isn't connected yet". Providers can be saved and tested; using them needs the page engine and the provider adapters.
- **Multiple profiles.** One hidden profile owns the site's cookies. Profile management is deferred.
- **Android and desktop.** iOS first.

## Known gaps

- The command bar opens from the top so the keyboard cannot cover it; keyboard behavior on a device is unverified.
- Page scrolling, pinch, pull-to-refresh and edge-swipe back through the touch router are unverified on a device.
- With no bottom bar the page runs under the home indicator; a site's own bottom controls may sit close to it.
- The fan has no sound or haptics.
- Closing sessions for memory is by count, idle time and the OS memory warning, not by measured memory or CPU: WebKit has no public per-page CPU or memory figure that this app could read [INFERENCE: not exhaustively checked]. See [Sessions](#sessions).
- Stats count foreground time on a site page. Time while a sheet is open, in the background, or on a page that is still loading its first address is not counted, and a page that runs audio or video in the background is not counted either. Midnight is the shell's local date at the time of each write, so up to about 30 s around it may land on the neighbouring day. Per-page areas use the first path segment only, so sites that keep everything under one path (or in a single-page app that never changes the address) show as one area.
- History keeps the typed address only: no page title, icon or time, and no per-entry delete (only Clear history).
