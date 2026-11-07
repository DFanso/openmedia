# Site Playbooks

> **Status: Implemented for the five default sites.** The recipes are `recipes/bundled/{instagram,facebook,twitter,reddit,youtube}.json`; their DOM fixtures are in `recipes/fixtures/`. This page is the knowledge behind them, written so that a weaker model (the in-app assistant, see [AI Assistant](./ai-assistant.md)) can write correct selectors for these sites and for new ones. When a selector here stops matching, fix the recipe and this page together.

Researched 2026-11-07 with an iPhone user agent at 390×844 in headless Chromium (not WebKit, so iOS rendering of these selectors is untested), logged out, plus community filter lists. **Nobody on this team could log in during research, so every logged-in selector below is `SOURCE` or `INFERRED`, not `LIVE`.** On-device checks on a real, logged-in account remain the user's.

Evidence tags used everywhere:

| Tag | Meaning |
|-----|---------|
| `LIVE` | Run with `document.querySelectorAll` against the real page in this research session; the match count is recorded. |
| `SOURCE` | Taken from a named, current community list or extension (URL in the sources). Not run by us. |
| `INFERRED` | Reasoned from naming patterns or memory. Not seen. Shipped only where being wrong is harmless (a hide rule for a nag that may never appear). |

## How options and defaults work

See [Recipe Format: Options](./recipe-format.md#options-user-facing-toggles). In short: Settings → Sites shows one switch per option; ON means hidden. **Annoyances** (install prompts, pop-ups that block the page, scroll locks, ad slots) default ON; **content** (Reels, Shorts, Stories, suggestions, feeds) defaults OFF. A test enforces the policy for every bundled recipe. Changing a switch recompiles the script and reloads the page. The user's choices are stored as overrides, so a release can change a default without migrating anyone who never touched the switch.

## Rules for writing a selector (for the in-app assistant)

What the validator allows: one CSS selector (comma lists fine) per rule; at most 300 characters, 19 commas and **2 `:has(` in the whole string**; no `{ } ; \ < @`, backtick or comments; balanced brackets. An option that needs more uses several rules. The `css` rule type takes only `display`, `visibility`, `opacity`, `overflow`, `overflow-x`, `overflow-y`, `position`, `pointer-events`, `filter`, `height`, `min-height`, `max-height`, `touch-action`, `backdrop-filter`. There is no text matching, no JavaScript, no redirect and no XPath.

1. **Find the stable anchor first.** In order of preference: custom-element tag name (YouTube `ytm-*`), `data-*` hook (`data-interaction`, `data-testid`, `data-log-comp-type`), `href` path (`a[href="/reels/"]`), `role` plus `aria-label`, `id`. Never a class that looks generated (`x1i10hfl`, `css-175oi2r`, `r-…`, Tailwind strings, `wbloks_*`); they rotate or sit on everything.
2. **Hide the smallest container, climbing from a child with `:has()`.** `div:has(> a[href="/reels/"])` hides the tab cell, not just the link, so the bar re-flows with no gap. Use `>` chains so the selector matches exactly one element per target.
3. **Count matches before shipping.** Run `document.querySelectorAll(selector).length`. One (or the number of items you expect) is good. Many means you picked a container. Never hide an element as tall as the screen, `main`, `#screen-root`, `ytm-browse`, a feed wrapper, or the player.
4. **Scope risky selectors.** A selector that is harmless logged out can break logged-in pages that reuse the markup. `[role="dialog"][aria-modal="true"]` is the "use the app" sheet logged out and the comment or share sheet logged in; scope it by something that only exists in the unwanted state (a login link on the page, a label prefix).
5. **Hide, don't remove,** and undo scroll locks with a `css` rule scoped to the state that sets them. Do not touch `body{overflow:hidden}` on pages that scroll inside an inner element (YouTube watch).
6. **Say when CSS cannot do it.** Text ("Suggested for you", "Sponsored", "For you"), routes (`/reels/`, `/shorts/ID`), clicks and cookies are outside CSS. Offer the nearest structural proxy (hide the tab, the shelf, the link) and say what remains.
7. **Labels are English.** `aria-label` and `tab-title` values are translated. Prefer `href`, `data-*` or tag names; if a label is the only hook, say it works for English accounts only.
8. **Ship families together.** When a site is mid-redesign (X), put both selector families in one rule; the absent family matches nothing.
9. **SPA pages mutate.** The stylesheet stays valid across pushState navigation, so write selectors that describe the thing, not the page load.

## Instagram (`instagram.default`)

- **Where it lands.** `www.instagram.com`, no redirect to `m.`. One React app for phone and desktop; an iPhone UA at phone width gets a mobile layout. SPA (pushState). Logged out, `/reels/` rewrites itself to `/reels/<shortcode>/`. Logged-out home `/` is a splash, not a feed; every deep link is an app or login funnel.
- **Classes are atomic hashes** (`x1i10hfl …`); only hrefs, roles, aria-labels, `main`, `header`, `article` are stable.
- **Logged-out bottom bar** is plain `div`s (fixed, 44 px, five `div > a` cells), not a `nav`. `nav a[href="/reels/"]` matches nothing.

| Option (default) | Rules and evidence |
|---|---|
| `app-prompts` (on) | `body:has(a[href^="/accounts/login"]) div:has(> div > div > div > [role="dialog"][aria-modal="true"])` `LIVE` 1 match on a profile and on `/reels/`: the fixed overlay that holds the dialog, the dimmed backdrop and the close button. Hiding only the dialog leaves a backdrop that eats taps; hiding it with `div:has([role=dialog])` matches 11 ancestors and blanks the page. The login-link prefix limits it to the logged-out state, so a logged-in share sheet is untouched (the full selector, prefix included, was re-run on a profile: 1 match, and 1 login link on the page). `header:has(a[href^="/accounts/login"]) a[href*="applink.instagram.com"]` `LIVE` 1: the Open app pill. |
| `reels` (off) | `div:has(> a[href="/reels/"])` `LIVE` 1 on `/`: the tab cell (the bar re-laid out cleanly). `div:has(> span > div > a[href="/reels/"])` `SOURCE` (Instagram Purified 2025-07; Hacker News 2025-08), the logged-in wrapper. `article:has(div[aria-label="Video player"])` `SOURCE` (Nuke Insta Slop, updated 2026-09): every video post, Reels **and ordinary videos**. `div[role="tablist"] > div:has(svg[aria-label="Reels"])` the SVG label is `LIVE` (1), the wrapper is `INFERRED`. |
| `explore-tab` (off) | `div:has(> a[href="/explore/"])` `LIVE` 1; wrapped form `div:has(> span > div > a[href="/explore/"])` `SOURCE`. Removes the search entry too. |
| `stories` (off) | `[aria-label="Stories"], [aria-label^="Story by"]` `SOURCE` (Instagram Unhook, 2025). Logged in only. |
| `suggested-posts` (off) | `main article + div:has(img[src*="illo-confirm-refresh"])` and the same followed by ` ~ article` `SOURCE` (Instagram Purified 2025-07-25). A structural proxy: the "You're all caught up" illustration; everything after it is hidden. Image path may rotate. |
| `feed-posts` (off) | `main article` `INFERRED/SOURCE`. Also hides a post opened by address, because CSS cannot tell the feed from a post page. |

**CSS cannot:** block `/reels/` (hide the entry points; a redirect rule does not exist yet); match "Suggested for you" or "Sponsored" by text; hide the splash "Open Instagram / Log In / Sign Up" buttons (hashed classes only, no stable attribute; they only appear logged out); dismiss the cookie dialog (never shown to the research session, no validated rule); Notes (not visible logged out, no selector).

**Pitfalls.** `a[href*="applink.instagram.com"]` unscoped matches 18 elements on a profile, including every grid tile. `header:has(a[href*="applink.instagram.com"])` also matches the profile's own `header`. `[role=dialog]` alone is 1 match but leaves the backdrop. No scroll lock was seen on these overlays (`html` `overflow: auto scroll`, `body` visible), so there is no unlock rule. The Threads link rule seen in a list was dropped: undated, and Threads moved domains in 2025.

**Examples.** *"Remove the Reels tab"* → `div:has(> a[href="/reels/"])`: the href is stable and `:has` removes the wrapper so no empty slot remains. *"Get rid of the 'Watch this reel in the app' popup"* → the overlay selector above, not `[role=dialog]`, because the dim backdrop sits beside the dialog. *"Hide Open app but keep the profile grid"* → scope under the header that holds the login link.

## Facebook (`facebook.default`)

- **Where it lands.** `www.facebook.com` redirects an iPhone UA to `m.facebook.com`, which is Meta's **Bloks** layout (`<html class="wbloks_10">`, `#screen-root`, `#app-body`, `data-mcomponent`, `data-type`), not the desktop Comet UI. `/marketplace/` stays on `www` but still serves Bloks. Desktop selectors (`[role=feed]`, `[aria-posinset]`, `div[role=banner]`, hashed `x…` classes) match nothing here. `wbloks_N`, `m` and `bg-sN` classes sit on almost every element; never use them. Bloks likely navigates inside `#screen-root` without reloads (`INFERRED`).
- Logged out: a login screen with an app banner; public pages (profile, Watch, Marketplace, a Reel) with a sticky Log In and Open app bar, and on Watch and Reels a bottom sheet "Get the full experience".

| Option (default) | Rules and evidence |
|---|---|
| `app-prompts` (on) | `div:has(> div > [aria-label^="Get Facebook"])` `LIVE` 1: the 42 px banner on the login page, login form intact. `[data-log-comp-type="navbar:open_app"]` `LIVE` 1 on `/facebook`, `/marketplace/`, `/watch/`, `/reel/`: the sticky Open app button; the attribute is language-independent. |
| `login-wall` (on) | `[role="dialog"][aria-modal="true"][aria-label^="Get the full experience"]` `LIVE` 1 on `/watch/`: hiding it let Watch scroll. Scroll unlock (`css`, `overflow: auto`) on `html:has(…)` and `body:has(…)` with the same dialog selector: the sheet sets `html{overflow:hidden}` on `/reel/` and `body{overflow:auto hidden}` on `/watch/`. Scoped so pages without the sheet keep their own overflow. |
| `reels` (off) | `[role="tab"][aria-label="Reels"]` `LIVE` 1 on `/facebook` (profile tab). `[role="button"][aria-label^="Reels"]` `LIVE` 1 on `/watch/` (the "Reels , 2 of 5" chip; prefix because of the counter). `[aria-label^="View reel video"]` `LIVE` (thumbnails; leaves an empty "Reels" header row, no stable parent found). |
| `stories` (off) | `div[aria-label="Stories"]` `SOURCE` (kurtnettle/uBO-filters-fb, undated). |

**CSS cannot:** block `/reel/` or `/stories/` (network rules only); match "Suggested for you", "Sponsored", "People you may know" by text (Facebook splits "Sponsored" into one-character spans). No Bloks selector was found for suggested or sponsored posts, People you may know, Groups suggestions, or the Marketplace/Watch/Gaming tabs, so there are no options for them: `INFERRED` tab labels would be English-only guesses. The cookie dialog (`[data-testid="cookie-policy-manage-dialog"]`, a second-hand summary) and a Messenger prompt were not seen and are not shipped.

**Pitfalls.** Never hide `[role="dialog"]` or every `aria-modal` dialog: a logged-in comment or share sheet is one too (`INFERRED`), and `[role=dialog]` alone matched 0 on some pages and 1 on others. On the login page a 844 px `div.wbloks_115` sits four levels above the banner and wraps the whole form: never climb that far. `:has()` over `[data-mcomponent]` can match the feed container itself and hide every post. `[aria-label="Open app"]` matches 2 (the bar and the sheet button); prefer the data attribute. Search-engine-suggested filters like `[data-type*="reel" i]` match nothing (`data-type` is `container` or `text`). The 2020 `m.facebook.com###login_top_banner` rule is for a different DOM and reportedly broke login.

**Examples.** *"Remove the 'Get Facebook for iOS' bar"* → `div:has(> div > [aria-label^="Get Facebook"])`: stable label text on a deep child, climb to the 42 px wrapper and stop. *"Stop the sign-in popup on Watch"* → hide the labelled dialog **and** unlock `html`/`body`.

## X / Twitter (`twitter.default`)

- **Where it lands.** `twitter.com` → `x.com`; iPhone UA stays on `x.com`. The match patterns cover both hosts.
- **Two front ends.** X announced a rebuilt web app on 2026-11-04 (The Verge, 2026-11-05). Logged-out visitors get it now; signed-in users move one country at a time. The rebuilt one has **no `data-testid` at all** (checked on `/`, a profile, a post, the login page, mobile and desktop); it uses `data-interaction`, `data-slot`, `data-engagement-action`, `role`, `href`, and Tailwind-style classes. The classic app keeps `data-testid` and hashed classes. SPA (pushState) in both. Same DOM for phone and desktop width. **Each option ships both families in separate rules; whichever is absent matches nothing.**
- Logged out, every action link on a profile or post is `https://m.x.com/…?launch_app_store=true&ct=engagement_*`; following one aborts and ends at the login page. No bottom sign-up bar, no cookie banner and no scroll lock on the rebuilt app in the research session.

| Option (default) | Rules and evidence |
|---|---|
| `app-prompts` (on) | `[data-interaction="app-store-obstruction"]` `LIVE` 1 on a profile and a post: the dialog wrapper; hiding it removed the dialog, dim and close button. `a[data-slot="xds-button"][href$="launch_app_store=true"]` `LIVE` 2: the header Open app pills. |
| `premium-upsells` (on) | `SOURCE` (FreekyCreep list 2026-09-27; AdGuard X filter 2025.1229; char gist 2025-02): `[data-testid="premium-signup-tab"]`, `[data-testid="verified_profile_visitor_upsell"]`, `[data-testid="TopNavBar"] a[href="/i/premium_sign_up"]`, and `nav a[href="/i/premium_sign_up"]` / `/i/verified-choose` / `/i/premium-business` / `/i/verified-orgs-signup`. Classic app only. |
| `promoted` (on) | `SOURCE`: `[data-testid="placementTracking"]:has(article)`; `[data-testid="cellInnerDiv"]:has([data-testid="top-impression-pixel"])` (hides the timeline cell, not the timeline; the second is from an undated gist). Default on as an in-feed ad the network blocker cannot see. |
| `grok` (off) | `SOURCE` (FreekyCreep): `a[href="/i/grok"]`, `a[href^="/i/grok-redirect"]`, `[data-testid="GrokDrawer"]`, `[data-testid="grokImgGen"]`, and `button[aria-label]:has(svg[viewBox="0 0 33 32"])` (the Grok logo, locale-independent). |
| `explore-tab` (off) | `a[data-testid="AppTabBar_Explore_Link"]` `INFERRED` (from memory of the classic tab bar). Trending lives on Explore on a phone, so this is the practical way to remove it. |

**CSS cannot:** hide only "For you" or force "Following" (no href or text to tell the tabs apart, and `[role=presentation]:first-child` would also hide "Posts" on profiles); hide "Discover more", "Today's News" or "Trending now" by text (all published rules use `:has-text`); block `/explore` or `/i/grok`; rewrite the logged-out `launch_app_store` links (`pointer-events:none` on them would make the page inert); dismiss the classic cookie banner (needs the `d_prefs` cookie). Sidebar rules (`sidebarColumn`, "Who to follow", `news_sidebar`) do nothing at phone width because the sidebar is not rendered, so they are not shipped.

**Pitfalls.** `a[href*="launch_app_store"]` matches 50 elements on a profile (every tab, like and status link). `[data-slot]` matches 33. Never hide `a[data-interaction="mobile-top-bar-log-in"]` (the only log-in link), `[data-testid="loginButton"]`, `article`, or an unscoped `[data-testid="BottomBar"]` (the classic logged-in tab bar). `:upward()` and `:has-text()` in the community lists are uBlock-only: use `X:has(> Y)`. A `svg[viewBox="0 0 22 22"]` verified-badge rule hides real check marks.

**Examples.** *"Stop the open-in-app popup"* → `[data-interaction="app-store-obstruction"]` plus the narrow `$=` pill rule: semantic markers, and the suffix excludes the 48 other `launch_app_store` links. *"Hide Grok everywhere"* → href, test id and the logo-`viewBox` form together.

## YouTube (`youtube.default`)

- **Where it lands.** `m.youtube.com` stays on `m.youtube.com` (adds `?ra=m`). An iPhone UA gets a DOM made of `ytm-*` custom elements plus newer view-model elements (`yt-lockup-view-model`, `grid-shelf-view-model`, `yt-tab-shape`, `chip-shape`, `lazy-list`, `yt-video-metadata-carousel-view-model`). **`ytd-*` elements never appear.** SPA. Paths: `/`, `/results?search_query=`, `/watch?v=`, `/shorts/ID`, `/@handle`, `/playlist?list=`, `/feed/you`, `/feed/subscriptions`; `/feed/explore` and `/feed/trending` redirected to `/`.
- Logged-out bottom bar: Home, Shorts, You (Subscriptions appears logged in, `INFERRED`). A fresh logged-out Home can be an empty "Try searching" page; later loads showed a feed. "Open App" appears only on `/watch`. No overlay and no scroll lock anywhere; `body{overflow:hidden}` on the watch layout is normal, do not override it.
- Lazy loading: Shorts cards appear after scrolling (0 → 3 → 9); CSS applies as nodes arrive.

| Option (default) | Rules and evidence |
|---|---|
| `open-app` (on) | `ytm-mobile-topbar-renderer ytm-button-renderer:has(> a[href^="vnd.youtube://"])` `LIVE` 1 on `/watch`: the header pill (height 40 → 0, nothing else changed). The mic button is also a `ytm-button-renderer`, so the `vnd.youtube://` link anchors it. |
| `promos` (on) | `ytm-mealbar-promo-renderer, ytm-statement-banner-renderer, ytm-upsell-dialog-renderer, ytm-brand-video-singleton-renderer` `INFERRED` from the `ytd-*` names in mjones.network and yt-neuter; none rendered logged out. |
| `ads` (on) | `ytm-companion-slot` `LIVE` 1 (empty companion container). `ytm-promoted-sparkles-web-renderer, ytm-promoted-video-renderer, ytm-ad-slot-renderer, ytm-masthead-ad-renderer` `INFERRED` (no ads were served to the logged-out sessions). |
| `shorts` (off) | `ytm-pivot-bar-item-renderer:has(.pivot-shorts)` `LIVE` 1 (`.pivot-shorts` alone matches 2 nodes). `ytm-rich-section-renderer:has(ytm-shorts-lockup-view-model)` `LIVE` 2 of 3 Home sections (the community-post section stays). `grid-shelf-view-model:has(ytm-shorts-lockup-view-model)` `LIVE` 4–5 on search. `ytm-video-with-context-renderer:has(a[href^="/shorts/"])` `LIVE` 3 after scrolling. `ytm-reel-shelf-renderer` `LIVE` 1 on `/watch`. `yt-tab-shape[tab-title="Shorts"]` `LIVE` 1 on a channel (English label). `ytm-chip-cloud-chip-renderer:has([aria-label="Shorts"])` `SOURCE` (gijsdev/ublock-hide-yt-shorts v2026.4.29; 0 in the tested chip bar, chips are personalised). |
| `home-feed` (off) | `ytm-rich-grid-renderer .rich-grid-renderer-contents` `LIVE` 1 (the feed container; `ytm-rich-grid-renderer` is only used on Home). Counted, not visually tested as hidden. |
| `home-chips` (off) | `ytm-feed-filter-chip-bar-renderer` `LIVE` 1 (leaves a blank gap of about the bar's height). |
| `comments` (off) | `ytm-item-section-renderer:has(> lazy-list > yt-video-metadata-carousel-view-model[aria-label="Comments"])` `LIVE` 1 (113 px → 0). English label. |
| `related` (off) | `.related-items-container` `LIVE` 1: player, title, actions and comments unaffected. |
| `playlists` (off) | `ytm-compact-playlist-renderer`, `ytm-compact-radio-renderer` `LIVE` (present on some pages only). |

**CSS cannot:** block `/shorts/ID` (hide every entry point; direct links still open the player; a request-level redirect is the known workaround, not available here); hide the "Open App" entry in the More sheet (an unmarked `<button>`, identical to "Feedback"); match by length or text; show only subscriptions; disable autoplay or video ads. The consent page (`consent.youtube.com`, EU) is another origin and was not reachable.

**Pitfalls.** Never hide `ytm-app`, `ytm-browse` (shared by Home, channels, playlists), `ytm-search`, `ytm-watch`, a bare `ytm-item-section-renderer` (also holds comments and all search results), `lazy-list`, `ytm-pivot-bar-renderer`, `#player` or `#movie_player`. A blanket `ytm-rich-section-renderer` hides the community posts and nudges too: scope with `:has(ytm-shorts-lockup-view-model)`. Endscreen cards (`.ytp-ce-element`) are `INFERRED` and sit inside `#movie_player`.

**Examples.** *"Hide Shorts everywhere"* → the `shorts` rules: each is the smallest container of an anchor unique to Shorts. *"Stop recommended videos on the watch page"* → `.related-items-container`. *"Empty my Home but keep search"* → `ytm-rich-grid-renderer .rich-grid-renderer-contents`.

## Reddit (`reddit.default`)

- **Where it lands.** `www.reddit.com` serves an iPhone UA the new **shreddit** web-component site (`<shreddit-app app-name="mweb3x" devicetype="mobile">`). `m.`, `i.` and bare `reddit.com` redirect there; `old.reddit.com` redirects to a login page when logged out, so only the shreddit DOM matters. The DOM is chosen by user agent, not viewport. Navigation is mixed: in-site links are SPA, but after the first navigation feed and logo links are `https://applink.reddit.com/…?utm_source=app_first_navigation`, which load a full page.
- **Anatomy.** Feed rows are `article > shreddit-post[post-type="video|image|gallery|link|multi_media"]` followed by a sibling `hr`; `shreddit-ad-post` is a direct child of `shreddit-feed` (not inside an `article`), also followed by an `hr`. Post pages put "People also ask", related posts and translations in `main > div#mosaic-pdp-feed`, separate from the comment tree. Feeds are virtualized (`div.virtualized-placeholder`), so never use `:nth-child`. Many components have shadow roots (`reddit-search-small`, parts of `shreddit-post`); injected CSS cannot reach inside them.
- **The blocking pop-up.** About 28 seconds into a feed (reproduced twice; trigger `global_feeds_30_sec`, experiment `mweb3x_feeds_blocking_xpromo_lo_page_fade`), `div#configured-xpromo-<experiment>.rpl-bottom-sheet.configured-xpromo` is added under `shreddit-app` and `body` gets the class `rpl-scroll-lock`, which the page styles `overflow: hidden !important`. The experiment name changes between releases (another author saw `global_direct_blocking` on 2026-10-17), so only the **id prefix** is matched.

| Option (default) | Rules and evidence |
|---|---|
| `app-prompts` (on) | `#xpromo-small-header, #open-app-header-cta` `LIVE` 1 each on the home feed, a subreddit and a post (`#open-app-header-cta` is the orange link, `#xpromo-small-header` its wrapper; **no banner under the header was found**, the old label was wrong). `div[id^="configured-xpromo-"]:not([id*="nsfw"])` `LIVE` 1 once the sheet is open, 0 before; hiding it removed card and backdrop. `html, body, body.rpl-scroll-lock` with `overflow-y: auto` (`css` rule), see pitfalls. |
| `google-sign-in` (on) | `#credential_picker_container, #credential_picker_iframe, auth-flow-google-one-tap-prompt`. The `position:fixed` 144 px `iframe#credential_picker_iframe` was seen `LIVE` once on a post page and did not return (intermittent); `auth-flow-google-one-tap-prompt` is `LIVE` 1 and empty; the container is `INFERRED` (Google Identity Services' standard wrapper). |
| `ads` (on) | `shreddit-ad-post, shreddit-ad-post + hr` `LIVE` 4 on `/`, 1 on a subreddit (the `hr` must go too or a stray divider stays). `shreddit-comments-page-ad` `LIVE` 1 on a post page (empty). `shreddit-sidebar-ad`, `shreddit-comment-tree-ad` `SOURCE` (Reddit UI Enhancer userscript dumps 2026-09/10), 0 matches logged out. |
| `advertise-links` (on) | `li:has(> a[href*="ads.reddit.com"])`, `li:has(> a[href^="/reddit-pro"])` the links were counted `LIVE` (1 each, in the account drawer); the `li` rows were not applied. |
| `video-posts` (off) | `article:has(> shreddit-post[post-type="video"])` and `… + hr` `LIVE` 7 of 7 on `/`. The same pattern works for `image` (6), `gallery` (1), `link`. |
| `suggested-communities` (off) | `in-feed-community-recommendations` `LIVE` 4 on `/explore/`; 0 in the home feed. |
| `related-posts` (off) | `#answers-suggested-queries-mosaic, div[id$="_related"], div[id$="_translations"]` `LIVE` on a post page: 1 each; hiding all three took `#mosaic-pdp-feed` to 0 px and the 5 comments stayed. |
| `comments` (off) | `div[id^="comment-tree-content-anchor"]` `LIVE` 1 (the post body is a separate sibling). |

**CSS cannot:** reach the search overlay's "Trending" and "Ask" (shadow DOM; hiding `reddit-search-small` breaks search); rewrite the `applink.reddit.com` links; stop the 30-second sheet from being created (hide and unlock only); tell suggested posts from normal ones (`shreddit-post[recommendation-source]` matches every post: 16 of 16 logged out); unblur NSFW posts; style old Reddit. A route block for `/answers/` or `/explore/` needs a redirect.

**Pitfalls.**

- *Scroll-lock specificity (measured).* `html, body { overflow-y: auto !important }` **loses** on `body` to `.rpl-scroll-lock { overflow: hidden !important }`, which is more specific; wheel scrolling only worked because `html` became `auto`, so `body`'s overflow stopped propagating. The rule must name `body.rpl-scroll-lock`. This is the "page would not scroll" bug the first recipe had. Fixture check, in Chromium: with the lock rule present, the compiled script gives `body` a computed `overflow-y` of `auto`.
- Hiding the sheet without the unlock leaves a frozen page; hiding the sign-up drawer also leaves `body.rpl-scroll-lock`.
- `.configured-xpromo` also matches the **18+ confirmation** on `/r/nsfw/` (`div#configured-xpromo-bypassable_xpromo_nsfw_bypassable`); hiding it would leave posts blurred with no way to confirm. Hence `:not([id*="nsfw"])`, and a fixture marks it `data-keep`.
- `configured-xpromo-modal` is only a template host (a `<template>` and a `display:none` `rpl-bottom-sheet`); hiding it does nothing.
- Never hide `rpl-bottom-sheet`, `.rpl-bottom-sheet` or `[role="dialog"]` generically (12 `rpl-bottom-sheet` on the home page, including the account menu `#hui-user-drawer` and the share menu; `div#reddit-search-dialog-content` is the search dialog), nor `faceplate-*` or `shreddit-async-loader` (74 data loaders), `shreddit-app`, `main`, `shreddit-feed`, `[recommendation-source]` or `[data-testid]` (92, none documented as stable).
- `#signup-drawer` matches twice (an empty `display:none` template and the rendered `div#signup-drawer`). It is not an option: it is the sheet that carries the log-in link, so hiding it would leave a logged-out user with no way in from there.
- Not seen: a cookie banner (`reddit-cookie-banner`, `SOURCE` JobcenterTycoon/cookie-auto-decline 2025-09; none appeared from a Sri Lanka address, consent applies to EU, UK and CA) and the Chat and Answers entries (not in the logged-out header). Not shipped.

**Examples.** *"Stop the pop-up that blocks scrolling"* → hide `div[id^="configured-xpromo-"]:not([id*="nsfw"])` and add the `css` rule on `html, body, body.rpl-scroll-lock`. *"Remove ads"* → `shreddit-ad-post` plus its `+ hr`. *"Hide all video posts"* → hide the article from its child with `:has(> shreddit-post[post-type="video"])`, and its divider.

## Bottom margin

Some sites draw fixed bars at the very bottom that sit under the screen edge or under the floating button. Settings → Bottom margin shrinks the native site view from the bottom (0–200 px, shared), and a site card can override it. It is a native layout setting, not CSS, so it works the same on every page and needs no selector. See [UI Design](./ui-design.md#settings).

## Sources

- Live pages (iPhone UA, 390×844, logged out, 2026-11-07): instagram.com `/`, `/reels/`, `/explore/`, `/instagram/`, a missing `/p/…`; `m.facebook.com` `/`, `/facebook`, `/watch/`, `/reel/`, `/groups_browse/`, `www.facebook.com/marketplace/`; x.com `/`, `/home`, `/explore`, `/NASA`, a status page, `/i/flow/login`; m.youtube.com `/`, search, watch, a Short, a channel, a playlist, `/feed/*`; www.reddit.com `/`, `/r/popular/`, a subreddit, a post, `/r/nsfw/`, `/explore/`, `/answers/`, search, a user page.
- Instagram: gist.github.com/viki53/74ab17ce5eb3c30699aae5620ad031e0 (Instagram Purified, 2025-07); gist.github.com/shraiwi/009c652da6ce8c99a6e1e0c86fe66886 (Nuke Insta Slop, 2026); greasyfork.org/en/scripts/551825 (Instagram Unhook); news.ycombinator.com/item?id=44941909 (2025-08); github.com/BevizLaszlo/UBlock-Filters-for-Social-Media (undated); secure.fanboy.co.nz/fanboy-mobile-notifications.txt.
- Facebook: github.com/kurtnettle/uBO-filters-fb (undated); gist.github.com/mustafamohsen/bede2bc01f5ddc310af023a490e3aab9 (2025-12, desktop only); greasyfork.org/en/scripts/548145 (desktop only); github.com/easylist/easylist/issues/6018 (2020, stale).
- X: theverge.com/tech/1027113/x-says-its-updated-web-app-is-way-faster (2026-11-05); pastebin.com/raw/Z2Tum43r (FreekyCreep, updated 2026-09-27); github.com/hgsanguk/adguard-x-filter (v2025.1229.0); gist.github.com/char/2b992f69eadafa94c78af30bf2cfda9e (2025-02); github.com/DandelionSprout/adfilt (TwitterPureReadingExperience); github.com/uBlockOrigin/uAssets commit 99deccb (2023-09, `d_prefs` cookie, possibly stale).
- Reddit: greasyfork.org/en/scripts/602031 (Reddit UI Enhancer, dumps 2026-09/10); github.com/zenstorage/Reddit-NSFW-Unblur (filters/ublock.txt, 2026-05); github.com/JobcenterTycoon/cookie-auto-decline commit ae1a88d (2025-09); reddit.com/r/Adguard/comments/1nsjorl (2025-09); sh.itjust.works/post/64935602 and the 2022/2024 r/uBlockOrigin threads on scroll lock (undated or stale; generic selectors rejected).
- YouTube: github.com/gijsdev/ublock-hide-yt-shorts (list.txt v2026.4.29; PR 58, 2025-07); github.com/insin/control-panel-for-youtube issue 187 (2026); mjones.network/ublock-filters.html and github.com/mchangrh/yt-neuter (desktop `ytd-*` names, undated).

## See Also

[Recipe Format](./recipe-format.md) · [AI Assistant](./ai-assistant.md) · [Site Runtime](./site-runtime.md) · [UI Design](./ui-design.md)
