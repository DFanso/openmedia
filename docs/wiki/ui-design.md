# UI Design

> **Status: Implemented on iOS.** Source lives in `src/` (`features/fab`, `features/sheet`, `features/settings`, `features/onboarding`, `features/web`). Gestures were exercised with synthetic pointer events, not a real finger; see [Platform Support](./platform-support.md#verified-results).

## Idea

The web is the product. The screen is one full-bleed page, from under the status bar to the bottom edge (no bar below it); everything else is a single floating button that stays out of the way. The button is the logo.

| Gesture | Result |
|---------|--------|
| Tap the button | Command bar slides in from the top. Type an address to open it. The AI prompt lives here too, but is **not connected yet** (see below) |
| Hold the button (about 380 ms) | The button grows about 30% and a ring fills around it, outside the button so a thumb does not hide it; then the favorites fan out on an arc, with settings tucked apart on the edge column above or below |
| Hold, slide onto an item, lift | Opens that favorite, or settings |
| Hold, lift, then tap an item | Same, in two steps |
| Drag the button | Moves it; on release it snaps to the nearer left or right edge and remembers its place |
| Pull the page down from the top | Native pull-to-refresh (`UIRefreshControl`); only where the page's own scroll view is at the top |

Defaults: Instagram, Facebook, Twitter, Reddit. Each fan item shows the site's icon on a white tile when one is known, otherwise a monogram. The command bar also has back, forward, reload, and "add this page to favorites".

## Settings

Four sections in one scrolling screen (the settings glyph is a sliders icon):

- **Appearance:** System, Light or Dark. Stored in `library.json` and applied to the app and, through the native view's `overrideUserInterfaceStyle`, to sites that follow `prefers-color-scheme`.
- **Favorites:** edit name and address, reorder, remove, add (up to 6). Saved with its own button.
- **AI assistant:** bring-your-own-key providers. See [AI Assistant](./ai-assistant.md#implemented-provider-settings).
- **Guide:** "Reset onboarding" marks the first-run guide unseen and shows it again.

## Onboarding

A four-step full-screen guide shows on first launch. Whether it has been seen is stored in `library.json` (`onboarded`). Each step has a looping illustration and a short line:

1. **The web, minus the noise.** What the app is, and that it hides things like app prompts.
2. **One button.** Tap to go to an address; the AI assistant is described as "soon".
3. **Hold for favorites.** An animated fan pops out of a pulsing button; settings sits apart.
4. **Make it yours.** Drag to either edge; change favorites in Settings.

It can be skipped at any step. Under `prefers-reduced-motion` the illustrations stay still.

## Aesthetic brief

- **Tone:** brutally minimal. One translucent control over the page, hairline borders, one accent.
- **Button:** 64 px, frosted white at about 55% opacity so the page shows through, with the logo at 40 px. The only animation on hold is the ring (a halo and a hue shift were tried and removed as too flashy).
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

## How it works

- **Layering.** The native site view is *below* the transparent shell, so the button draws over the page. A native `TouchRouter` sends a touch to the shell inside the rectangles the shell reports (`[data-hit]` elements), and to the page everywhere else. Details: [Platform Support](./platform-support.md#layout-model-mobile).
- **Gesture logic** is a pure state machine (`features/fab/gesture.ts`) and the layout math is pure (`features/fab/geometry.ts`), both unit-tested. The fan layout searches rotations, side flips and a compacting arc until every item fits on screen, for 0 to 6 favorites at any height.
- **Persistence.** Favorites, the last page, theme, icons, provider settings and the onboarding flag are in `library.json` (Rust). The button position is a UI preference in `localStorage`, as a fraction of height so rotation keeps its place.

## Not connected yet

- **AI assistant.** The prompt box accepts addresses only. Typing a request shows "isn't connected yet". Providers can be saved and tested; using them needs the page engine and the provider adapters.
- **Multiple profiles.** One hidden profile owns the site's cookies. Profile management is deferred.
- **Android and desktop.** iOS first.

## Known gaps

- The command bar opens from the top so the keyboard cannot cover it; keyboard behavior on a device is unverified.
- Page scrolling, pinch, pull-to-refresh and edge-swipe back through the touch router are unverified on a device.
- With no bottom bar the page runs under the home indicator; a site's own bottom controls may sit close to it.
- The fan has no sound or haptics.
