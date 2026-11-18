# Profiles

> **Status: Implemented.** Rust: `src-tauri/src/profiles.rs`. Shell: `src/features/profiles/`. Site-view plugin: `remove_profile` (desktop, iOS, Android). Not yet run on a device or in a release build; see [Not verified](#not-verified).

A profile is a separate set of everything the user keeps, with its own site sign-ins. Each person (or purpose: work, kids, a second account) gets their own app without signing out of anything.

## What belongs to a profile

| Per profile | Shared by every profile |
|---|---|
| Favorites, folders and their icons and layouts | Usage totals, limits, schedules, pause screens and the settings lock (`usage.json`) |
| Every setting in `library.json`: theme, language, search engine, ad blocking, margins, accessibility, video controls, dark mode, per-site choices, floating-button tools | Downloads and their settings (`downloads.json`) |
| Recipes (made and installed) and their option choices | Purchases (Pro) |
| History, the last page and its Back list | The GitHub share sign-in |
| Assistant providers (and their keys, by provider id) and saved chats | The floating button's position |
| Saved passwords: its own `passwords.vault` and its own key in the OS secure store | |
| The incognito set (favorites, folders, recipe choices) | |
| Keyboard shortcuts (the shell's `localStorage`, keyed by profile id; `src/shared/profileStorage.ts`) | |
| **Site cookies and storage**: the profile id is the id of its site data store | |

Usage limits are a commitment device: a second profile must not be a way around them, so they stay with the device.

## Files

`profiles.json` in the app data folder lists the profiles (`id`, optional `name`, optional `icon`), names the active one and the *first* one, and lists deleted profiles whose site data store is still to be erased (`unerased`).

- The **first** profile is the one from before profiles existed. Its files stay where they were: `library.json`, `recipes/`, `chats.json` and `passwords.vault` in the app data folder, and its vault key keeps the fixed id `vault::KEY_ID`. A first launch of this version writes `profiles.json` with the existing library's `profileId` as the first profile; nothing moves. Its name is unset until the user names it; the shell shows *Personal*.
- Every **later** profile keeps the same files in `profile-data/<id>/` (not `profiles/`, which the desktop site view uses for its WebView2 and WebKitGTK data folders). Its vault key is stored under its own id.

A new profile starts with the defaults (the guide runs on its first open), in the language and theme of the profile it was made from. At most 10 profiles, each a site data store of its own.

## Switching

The app keeps one `Library`, `Recipes`, `Chats` and `Vault`. `profile_switch`:

1. The shell cancels the assistant turn and closes every page natively (`siteView.close`), so no view of the old profile's data store outlives the switch.
2. Rust loads the profile's stores, marks it active, leaves incognito (and drops its private downloads), locks the password vault, and puts the stores in place (`adopt`).
3. Rust pushes the profile's background-media, picture-in-picture and desktop-site lists and recipe script to the site view, and starts opening its start page (`Boot::restart`), as at launch.
4. The shell records the profile in its own storage and reloads. It reads the new state with `get_state` and adopts the page Rust is opening, exactly as at launch.

## Deleting

The profile in use cannot be deleted. `profile_delete` removes the profile from `profiles.json` (adding it to `unerased`), deletes its files (for the first profile, only its own files in the app data folder), deletes its vault key and its assistant keys from the OS secure store, then asks the site view to erase its data store (`remove_profile`, Rust-only like `clear_site_data`). A store the system will not erase yet (a web view of it is still alive) stays in `unerased` and is erased at the next launch, before any of its pages could open.

| Platform | `remove_profile` |
|---|---|
| macOS | `WKWebsiteDataStore.removeDataStoreForIdentifier` |
| iOS | `WKWebsiteDataStore.remove(forIdentifier:)` (iOS 17) |
| Android | `ProfileStore.deleteProfile` (refused while a view uses it) |
| Windows, Linux | deletes `profiles/<id>` in the app data folder |

## Icons

A profile, like a folder, may carry one of the drawn icons in `src/shared/glyphs.tsx`. Rust stores only the name and accepts any lowercase name (`library::is_icon_name`); the shell draws the ones it knows and treats anything else as no icon. Without an icon a profile shows the first letter of its name. Folder icons used to be emoji: a library saved with one is rewritten on load to the drawn icon that took its place (`EMOJI_ICONS` in `library.rs`), and an emoji with no counterpart is dropped, so the folder shows what is in it.

## Shell

- The floating button's tool column has a **Profiles** button (the active profile's icon or letter) that opens the Profiles page.
- Settings → General → **Profiles** opens the same page; the keyboard action `nav.profiles` too.
- On the Profiles page a tap on a profile switches to it; **Edit** renames it, picks its icon or deletes it; **New profile** adds one.

## Security

No new command or capability is reachable from a site view. Profile commands are app commands for the shell only; `remove_profile` is a Rust-only plugin method with no command or permission, like `clear_site_data`. Profile isolation (invariant 8) holds because each profile's pages open in the data store named by its own id, and the shell never sees cookies or storage of any profile.

## Not verified

Switching, creating and deleting were exercised by Rust unit tests (`profiles.rs`, `library.rs`, `vault.rs`) and the shell's type check and unit tests only. Not run: a two-profile sign-in on a device or simulator (iOS, Android), on macOS, Windows or Linux; erasing a deleted profile's data store on any platform.
