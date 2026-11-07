# UI Design

> **Status: Implemented on iOS.** Source lives in `src/` (`features/fab`, `features/sheet`, `features/settings`, `features/onboarding`, `features/web`). Gestures were exercised with synthetic pointer events, not a real finger; see [Platform Support](./platform-support.md#verified-results).

## Idea

The web is the product. The screen is one full-bleed page; everything else is a single floating button that stays out of the way. The button is the logo.

| Gesture on the button | Result |
|-----------------------|--------|
| Tap | Command bar slides in from the top. Type an address to open it. The AI prompt lives here too, but is **not connected yet** (see below) |
| Hold (about 380 ms) | A ring fills and a halo pulses while its hue drifts; then the favorites fan out on an arc, with settings tucked apart on the edge column above or below the button |
| Hold, slide onto an item, lift | Opens that favorite, or settings |
| Hold, lift, then tap an item | Same, in two steps |
| Drag | Moves the button; on release it snaps to the nearer left or right edge and remembers its place |

Defaults: Instagram, Facebook, Twitter, Reddit. Settings edits the list (name, address, order, up to 6) and replays the guide. The command bar also has back, forward, reload, and "add this page to favorites".

## Onboarding

A four-step full-screen guide shows on first launch and can be replayed from Settings ("Replay the guide"). Whether it has been seen is stored in `library.json` (`onboarded`). Each step has a looping illustration and a short line:

1. **The web, minus the noise.** What the app is, and that it hides things like app prompts.
2. **One button.** Tap to go to an address; the AI assistant is described as "soon".
3. **Hold for favorites.** An animated fan pops out of a pulsing button; settings sits apart.
4. **Make it yours.** Drag to either edge; change favorites in Settings.

It can be skipped at any step. Under `prefers-reduced-motion` the illustrations stay still.

## Aesthetic brief

- **Tone:** brutally minimal. One light control over the page, hairline borders, one accent.
- **Color:** taken from the logo (`assets/logo.svg`): cyan `#06aff8` as the accent, navy `#021669`, ink `#070b14`, text `#eef3fa`, hairline `rgb(190 220 255 / .16)`. Panels are dark glass; the floating button is frosted white so the blue logo reads over any page, light or dark. (An earlier warm-amber accent was dropped when the logo went in.)
- **Type:** Schibsted Grotesk (variable), bundled through `@fontsource-variable/schibsted-grotesk`. No CDN: the app makes no third-party requests. Tabular figures for addresses.
- **Motion:** two moments. The hold response (ring fill, pulsing halo, drifting hue) and the fan (spring out, staggered about 35 ms, folds back in reverse). Everything else is a plain ease. `prefers-reduced-motion` removes the pulse and the stagger.
- **Layout:** asymmetric and edge-hugging. Nothing is centered except onboarding.
- **Favorite icons:** a monogram, not a favicon, because fetching favicons would contact third parties.

Tokens are in `src/index.css` (`@theme`).

## Logo and icons

`assets/logo.svg` is the source and is not edited. Two derived files:

- `assets/icon-source.svg`: a square 1024 master (logo at about 74% width on white) used by `yarn tauri icon assets/icon-source.svg` to generate every platform icon (`src-tauri/icons/`, `src-tauri/gen/apple/Assets.xcassets`).
- `src/assets/logo-mark.svg`: the same paths with `preserveAspectRatio="none"` and the fixed size removed, so it scales uniformly inside the button and onboarding.

## How it works

- **Layering.** The native site view is *below* the transparent shell, so the button draws over the page. A native `TouchRouter` sends a touch to the shell inside the rectangles the shell reports (`[data-hit]` elements), and to the page everywhere else. Details: [Platform Support](./platform-support.md#layout-model-mobile).
- **Gesture logic** is a pure state machine (`features/fab/gesture.ts`) and the layout math is pure (`features/fab/geometry.ts`), both unit-tested. The fan layout searches rotations, side flips and a compacting arc until every item fits on screen, for 0 to 6 favorites at any height.
- **Persistence.** Favorites, the last page and the onboarding flag are in `library.json` (Rust). The button position is a UI preference in `localStorage`, as a fraction of height so rotation keeps its place.

## Not connected yet

- **AI assistant.** The prompt box accepts addresses only. Typing a request shows "isn't connected yet". Customizing a site with AI needs more of the page engine and a provider key (Phase 3).
- **Multiple profiles.** One hidden profile owns the site's cookies. Profile management is deferred.
- **Android and desktop.** iOS first.

## Known gaps

- The command bar opens from the top so the keyboard cannot cover it; keyboard behavior on a device is unverified.
- Page scrolling, pinch, and edge-swipe back through the touch router are unverified on a device.
- The fan has no sound or haptics.
