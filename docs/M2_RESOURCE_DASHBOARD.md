# M2 — Responsive Resource Operations Dashboard

The legacy resource list — a fixed **380 px**, four-column `<table>` of 60 px
rows — is replaced by a responsive grid of resource cards, as specified under
"Resource cards" in [VISUAL_DIRECTION.md](VISUAL_DIRECTION.md).

This is a **read-only view replacement**. No gameplay, balance, progression,
economy or save-schema change ships in M2.

## The design decision that makes parity structural

The dashboard is not a reimplementation of the resource list; it is a
**projection of it**. Every card is derived from its legacy
`<tr id="<res>Nav">` row, at runtime:

| Card property | Where it comes from |
| --- | --- |
| Identity (name, icon) | The row's own cells and `<img>` |
| Description (tooltip) | `Game.resourceData[id].desc` |
| Grouping + group titles | The `collapse*` header rows, in document order |
| Locked / unlocked | The row's `.hidden` class — **mirrored, never overridden** |
| Selected | The `info` class that `activeResourceTab()` applies |
| Current / capacity / rate | `getResource` / `getStorage` / `getProduction` |
| Number formatting | `Game.resourcesUI.create{Resource,Storage,Production}Delegate` |
| Activation | A real `click()` dispatched **on the legacy row** |

Consequences worth stating plainly:

- **There is no second source of truth.** A card cannot disagree with its row
  about a number, because it asks the same accessor and formats it with the same
  delegate the row uses. (Verified empirically: 0 mismatches across 19 resources
  × 10 viewport/state combinations — see the parity column below.)
- **There is no duplicated interaction logic.** Clicking a card dispatches a
  genuine click on the `<tr>`, so the inline `onclick="activeResourceTab(…)"`
  *and* Bootstrap's `data-toggle="tab"` data-api run exactly as they do for a
  legacy click. Selection state then flows back from the row's class.
- **Nothing was hardcoded.** The resource list, its order, its groups and its
  icons are read from the DOM, so a change to the legacy list propagates without
  touching the dashboard.

## What M2 delivered

- `ui/modern/resourceDashboard.js` — presentation-only module registered in
  `Game.uiComponents`, so it initialises and ticks on the game's own UI loop
  (10 Hz). Every DOM write is diffed against a cache first; a tick that changes
  nothing touches nothing.
- `styles/modern/resources.css` — the card system: grid, storage meters, state
  badges, rate treatment, density variants and the responsive collapse to dense
  rows.
- **Per-card information** (per VISUAL_DIRECTION): icon + name, state badge,
  `current / capacity` in tabular figures, a storage fill meter, the per-second
  rate signed and coloured, and **time-to-full / time-to-empty** rendered with
  the game's own `Game.utils.getFullTimeDisplay`.
- **Category grouping** — Energy tier, Earth, Inner Planetary, Outer Planetary —
  with groups that collapse away entirely while all their members are locked.
- **Density control** — *Comfortable* (cards) and *Compact* (dense rows) for
  late-game players scanning many resources. On phones every card becomes a
  dense full-width row automatically.
- **Reclaimed layout** — the 380 px float is gone, so the selected resource's
  detail panel now uses the full workspace width. This closes the M1 known
  limitation "desktop horizontal whitespace".
- **Fallbacks** — `?resources=legacy` keeps the modern shell but restores the
  legacy table; `?ui=legacy` restores the original presentation wholesale.

## Safety properties

- **Read-only over game state.** The module never writes a resource, rate,
  storage or any gameplay global, and never calls `Game.save`/`Game.load`,
  `addResource`, `takeResource` or `setPerSecondProduction`. Asserted both
  behaviourally (50 ticks + a click leave every game global byte-identical) and
  statically over the source.
- **The save is untouched.** `localStorage["save"]` is never read or written.
  The only key the dashboard touches is its own presentation preference,
  `sc.ui.resourceDensity` (see [SAVE_COMPATIBILITY.md](SAVE_COMPATIBILITY.md)).
- **The `.hidden` contract is intact.** The dashboard mirrors `.hidden` into its
  own `sc-is-locked` class; it never adds, removes or restyles `.hidden`, and no
  rule in `resources.css` mentions it. Legacy row classNames are unchanged after
  any number of ticks.
- **Bootstrap tab mechanics are untouched.** No rule sets `display` on
  `.tab-pane`, `.fade`, `.in` or `.active`.
- **Degrades to the legacy list.** The CSS that hides the legacy column is
  `#scResourceDashboard ~ .container.col-xs-1`, so it only applies when the
  dashboard is genuinely in the DOM. If the module throws during build it
  removes its own root and the legacy table stays visible — the fallback is
  structural, not a promise.

## Tested viewports — EXACT

Validated with **puppeteer-core driving the system Google Chrome** (headless,
`page.setViewport` sets the true CSS viewport), against the **deployed** site in
an isolated browser context per case. Each row's `innerWidth`/`innerHeight` were
read from the live page and match the request exactly. The QA harness lives in
scratchpad and is not committed / not in the dependency graph. "Parity" = card
value vs. its legacy row's data-bound span, for every visible resource.

The deployed build was confirmed to be the reviewed commit by fetching **all 74
tracked JS/CSS/HTML/JSON assets** and comparing SHA-256 against the git blobs:
74 identical, 0 different.

| Requested | actual innerWxH | scrollWidth | H-overflow | state | cards shown | off-screen cards | parity mismatches | console | net |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1440×900 | 1440×900 | 1440 | ✅ none | fresh | 3 | none | 0 | 0 err | 0 fail / 0 tracker |
| 1024×768 | 1024×768 | 1024 | ✅ none | fresh | 3 | none | 0 | 0 err | 0 / 0 |
| 768×1024 | 768×1024 | 768 | ✅ none | fresh | 3 | none | 0 | 0 err | 0 / 0 |
| 390×844 | 390×844 | 390 | ✅ none | fresh | 3 | none | 0 | 0 err | 0 / 0 |
| 360×800 | 360×800 | 360 | ✅ none | fresh | 3 | none | 0 | 0 err | 0 / 0 |
| 1440×900 | 1440×900 | 1440 | ✅ none | progressed | 19 | none | 0 | 0 err | 0 / 0 |
| 1024×768 | 1024×768 | 1024 | ✅ none | progressed | 19 | none | 0 | 0 err | 0 / 0 |
| 768×1024 | 768×1024 | 768 | ✅ none | progressed | 19 | none | 0 | 0 err | 0 / 0 |
| 390×844 | 390×844 | 390 | ✅ none | progressed | 19 | none | 0 | 0 err | 0 / 0 |
| 360×800 | 360×800 | 360 | ✅ none | progressed | 19 | none | 0 | 0 err | 0 / 0 |
| 1440×900 | 1440×900 | 1440 | ✅ none | **late game** | 19 | none | 0 | 0 err | 0 / 0 |
| 390×844 | 390×844 | 390 | ✅ none | **late game** | 19 | none | 0 | 0 err | 0 / 0 |

No card overlapped another and no card escaped the viewport in any case.

Minimum card height: **119 px** on desktop/tablet, **61–62 px** on phones — the
dense row form stays well above the 44 px touch-target floor.

The progressed state is **synthetic**: producers are given counts and the game's
own `refreshPerSec()` computes the rates, so every number on screen was produced
by the real economy. Never a real player's save.

## Functional QA (live browser)

- ✅ **Value parity**, every resource, every viewport: card `current` and card
  rate equal the legacy row's `#<res>` / `#<res>ps` spans (sign normalised — the
  card renders the minus as its own glyph so a deficit reads `−2940/s`, never
  `−−2940/s`).
- ✅ **Selection** — clicking a card sets the row to `earth sideTab info`, opens
  `#metalTab` (`tab-pane fade in active`) at the **full 1300 px** workspace
  width, and dismisses the empty-state hint.
- ✅ **Keyboard** — cards are real `<button>`s: focusable, `Enter` activates,
  `aria-pressed` reflects selection, and the cyan focus ring renders.
- ✅ **Tab isolation** — switching to *More* leaves exactly one visible pane
  (`['more']`); the locked `#researchTab` stays `display:none`. No locked
  content is exposed.
- ✅ **`?ui=legacy`** → `data-ui="legacy"`, `data-resources="legacy"`, no
  dashboard, legacy column `display:block`, original presentation intact.
- ✅ **`?resources=legacy`** → modern shell (`data-ui="modern"`) with the legacy
  resource table restored. Both fallbacks: 0 console errors, no overflow.
- ✅ **Save safety** — with a sentinel company name: `Game.save()` writes plain
  JSON, reload restores `SENTINEL-M2`, and `localStorage` holds exactly
  `["save", "sc.ui.resourceDensity"]`. The density preference does **not**
  appear anywhere in the save payload.
- ✅ **Density preference** survives reload and is restored from its own key.
- ✅ **No console errors** and **no failed first-party requests** at any viewport,
  in either state, in either fallback mode. No Google-Analytics/Kongregate
  requests (M1's privacy cleanup holds).

## Update mechanism & cost

The dashboard adds **no loop of its own**. It registers a single component in
`Game.uiComponents`, so `initialise()` runs inside `Game.loadDelay` and
`update()` runs on the game's existing 100 ms "UI Update" interval. Measured on
the deployment with `requestAnimationFrame`, `setInterval` and `setTimeout`
wrapped before any page script ran, cards on vs. cards off:

| | rAF calls / 3 s | `setInterval` calls | interval periods | `Game.intervals` | `uiComponents` |
| --- | --- | --- | --- | --- | --- |
| dashboard on | 47 | 1 | `[100]` | Loading Animation, Fast/Slow/UI Update | 7 |
| `?resources=legacy` | 40 | 1 | `[100]` | *identical* | 7 |

Identical in both: one `setInterval(100)`, one rAF chain, the same four game
intervals. No second simulation loop, no per-card timer, no extra rAF.

Isolated sync cost (300 warm iterations, 19 unlocked resources):

| state | dashboard sync | legacy bound elements | `Game.fastUpdate` | share of the 100 ms tick |
| --- | --- | --- | --- | --- |
| progressed | 1.17 ms | 21.52 ms | 30.38 ms | **1.2 %** |
| late game | 2.40 ms | 27.25 ms | 33.04 ms | **2.4 %** |

The projection costs roughly **a tenth** of the legacy data-binding layer it
sits beside, because every DOM write is diffed against a cache first.

## Automated tests

`npm run verify` (lint → deterministic build → tests): **111 tests, 0 failures**
(60 before M2; **51 new**).

- `test/resourceDashboard.test.mjs` (27) — drives the real module against a
  legacy-shaped fixture in a `vm` sandbox: projection order and grouping,
  identity read from the row, delegate-driven formatting, the single-sign rule,
  uncapped storage (`∞`, meter hidden), meter percentage and ETA arithmetic,
  state classification and labelling, lock/unlock mirroring, group collapse,
  selection mirroring, click delegation (including clicks on nested card parts),
  the density toggle and its persistence, the read-only guarantees, the
  `localStorage` key restriction, both legacy fallbacks, double-`initialise`
  safety, missing-list degradation, and button/ARIA semantics.
- `test/m2ResourceView.test.mjs` (12) — static guards over `index.html` and
  `resources.css`: the legacy list still has the shape the projection reads
  (≥19 rows, each with icon, 4 cells, `activeResourceTab` handler,
  `data-toggle="tab"` and `#<res>ps` binding), the `collapse*` group rows and
  lock classes survive, FOUC-safe mode resolution, script ordering, the
  conditional (`~`) legacy-column hide, modern+cards scoping, no `display` on
  tab machinery, no `.hidden` rule, the phone breakpoint, reduced motion.
- `test/helpers/miniDom.mjs` — a ~150-line dependency-free DOM (elements, text
  nodes, attributes, `getElementById`, `getElementsByTagName`, bubbling clicks)
  so first-party presentation scripts can be executed under `node --test`.
- `test/modernShell.test.mjs` extended: the new CSS/JS assets are covered by the
  asset-existence check and by the `.hidden`-contract scan.
- `test/packageMetadata.test.mjs` (6) — added during the deployed review, after
  the root licence was found to disagree between `package.json`
  (`SEE LICENSE IN LICENCE.txt`) and `package-lock.json` (`MIT`). npm refreshes
  the lockfile's copy of the root fields only on regeneration and `npm ci` does
  **not** flag the mismatch, so the drift was silent. The lockfile was
  reconciled with `npm install --package-lock-only` (no hand-editing) and these
  assertions now pin name/version/licence agreement, that the referenced licence
  file exists and still carries the original author's copyright, that the
  project installs nothing, and that `.nvmrc` satisfies `engines.node`.

## Screenshots (in `docs/screenshots/`)

Exact-viewport captures taken from the **deployed** build at
<https://spacecompany-rodrigo.pages.dev>, in an isolated browser context per
shot, system Chrome via puppeteer-core, retina @2×. All post-correction.

| File | Viewport | State | Notes |
| --- | --- | --- | --- |
| `m2-final-fresh-1440x900.jpg` | 1440×900 | fresh | Three unlocked resources, empty-state hint. |
| `m2-final-progressed-1440x900.jpg` | 1440×900 | progressed | All 19 cards, four category groups, live rates and ETAs. |
| `m2-final-lategame-1440x900.jpg` | 1440×900 | late game | Huge values and multi-year ETAs — nothing truncated. |
| `m2-final-selected-1440x900.jpg` | 1440×900 | late game | Metal selected — cyan card, hint dismissed, detail panel below. |
| `m2-final-compact-1440x900.jpg` | 1440×900 | late game | Compact density: 19 resources + detail panel on one screen, full names. |
| `m2-final-progressed-1024x768.jpg` | 1024×768 | progressed | Compact desktop / tablet. |
| `m2-final-progressed-768x1024.jpg` | 768×1024 | progressed | Tablet portrait (ETA line drops). |
| `m2-final-progressed-390x844.jpg` | 390×844 | progressed | Phone: single-column dense rows. |
| `m2-final-lategame-390x844.jpg` | 390×844 | late game | Phone at late-game magnitudes. |
| `m2-final-progressed-360x800.jpg` | 360×800 | progressed | Narrowest phone. |
| `m2-final-fallback-resources-legacy-1440x900.jpg` | 1440×900 | progressed | `?resources=legacy` — modern shell, legacy table. |
| `m2-final-fallback-ui-legacy-1440x900.jpg` | 1440×900 | progressed | `?ui=legacy` — original Bootstrap presentation. |

## Accessibility notes

- Cards are `<button type="button">` with `aria-pressed` — keyboard reachable
  and operable with a visible focus ring, no `tabindex` juggling.
- **State is never colour-alone**: each card carries a glyph + word badge
  (`▲ Producing`, `▼ Draining`, `◆ Full`, `▬ Idle`) *and* a coloured edge strip;
  the rate carries an explicit `+` / `−` / `·` sign glyph.
- Storage meters expose `role="progressbar"` with `aria-valuenow` and a label.
- Icons are `alt=""` / `aria-hidden` decoration; the resource name is real text.
- `prefers-reduced-motion: reduce` removes card transitions and the meter tween.

## Deployed review — defects found and corrected

The branch was reviewed as **deployed** (Cloudflare Pages), including a
**late-game** synthetic state that earlier passes had not exercised. Two genuine
M2 defects surfaced, both only at late-game magnitudes; both are corrected and
guarded by tests.

### 1. Truncated ETAs (blocker) — and an inherited years bug behind it

At late-game scale **9 of 9 visible ETAs were ellipsis-clipped** at 1440×900:
`full in 93 Days 16:53…`, `full in 156 Days 15:5…`. The ETA line had 149 px and
needed 152–166 px, because both the rate (`+260.000/s`) and the duration grow
with progression.

Investigating it exposed something worse. `Game.utils.getFullTimeDisplay` prints
only `splitDateTime()[1]` — the **days remainder after years are extracted** —
so it silently drops the years component: a 789-year ETA rendered as
`93 Days 16:53:07`. The truncation was hiding a number that was already wrong by
centuries.

**Fix:** the card's ETA now reads the same `splitDateTime` decomposition
directly. Under a day it still defers to `getFullTimeDisplay`, so a card matches
the detail panel exactly (`04:22:29`). Past a day it compacts —
`93d 16h`, `789y 93d` — which is both truthful and narrow enough that no ETA can
clip. The legacy helper itself is **not** modified; the detail panel's
"time remaining" line is untouched (that inherited quirk is logged below).

Durations under one second are now dropped entirely rather than rendered as
`full in 00:00:00`, which read as broken rather than as "imminent".

### 2. Truncated resource names in compact density (blocker)

In the dense form at late-game values, names collapsed to `URAN…`, `LUNA…`,
`METH…`, `TITAN…`: wide values (`1,000Qa / 1,000Qa`) grew the value column and
the name was the only flexible element, so it absorbed all the squeeze.

**Fix:** in compact density the state **word** yields instead of the name. The
word is moved to screen-reader-only (`clip-path`, *not* `display:none`, so it is
still announced) and the state **glyph** stays visible — so state is still not
carried by colour alone. The name is given `flex: 1 1 auto` so it is the last
thing to give way.

### Verification of the corrections

A clipping sweep now runs over **every combination** of 5 viewports ×
{progressed, late game} × {comfortable, compact} = **20 cases**, measuring
`scrollWidth > clientWidth` on each card's name, value, capacity, rate and ETA:

| | clipped text | h-overflow | parity mismatches |
| --- | --- | --- | --- |
| before | 9 (ETA) + 4 (names) | none | 0 |
| after | **0 / 20 cases** | none | 0 |

### Not M2 defects (recorded, not changed)

- **79 duplicate DOM ids** (`star__<n>_name`) — the inherited interstellar UI
  renders each star's name `<h3>` in both its travel and conquer tables. The
  count is **identical (79) with the dashboard present, with `?resources=legacy`
  and with `?ui=legacy`**, so M2 neither causes nor increases it. M2's own 23
  ids are unique, as are all `#<res>` / `#<res>ps` / `#<res>Nav` bindings.
  Belongs to the M4 interstellar work.
- **`842,0T` / `1,000Qa` number formatting** — `Game.settings.format`'s own
  locale-dependent output. The card renders exactly what the legacy row renders
  (0 parity mismatches), so changing it would change both views and is outside a
  read-only view replacement.
- **`getFullTimeDisplay` drops years** — still true for the legacy detail panel.
  Fixing the shared helper would alter legacy output; it is logged here for the
  milestone that owns that code.

## Known limitations (intentionally deferred)

- **Live regions.** Values update silently; announcing important transitions
  (storage full, energy deficit) is part of the M5 accessibility pass, not M2.
- **ETA precision past a day is coarse** (`93d 16h`). That is deliberate — see
  the deployed-review section — but it means the card and the detail panel show
  the same duration at different resolutions above 24 h.
- **No filter/search.** With 19 resources, grouping plus the density toggle is
  enough; a filter belongs with a larger late-game inventory.
- **The detail panel is still legacy markup.** M2 replaces the resource *list*
  and gives the panel the full width; restyling the panel's internals (gain
  buttons, machine tables, storage upgrades) is not in scope here.
- **Light theme** remains deferred, as in M1 — dark is the canonical identity.
- **Legacy fallback on mobile** still overflows at 390 px (`?ui=legacy`,
  scrollWidth 405). That is the inherited original Bootstrap layout; the card
  dashboard is precisely what fixes it in modern mode.
