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
`page.setViewport` sets the true CSS viewport). Each row's `innerWidth`/
`innerHeight` were read from the live page and match the request exactly. The
QA harness lives in scratchpad and is not committed / not in the dependency
graph. "Parity" = card value vs. its legacy row's data-bound span, for every
visible resource.

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

## Automated tests

`npm run verify` (lint → deterministic build → tests): **99 tests, 0 failures**
(60 before M2; **39 new**).

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

## Screenshots (in `docs/screenshots/`)

Exact-viewport captures, system Chrome via puppeteer-core, retina @2×.

| File | Viewport | State | Notes |
| --- | --- | --- | --- |
| `final-m2-cards-1440x900.jpg` | 1440×900 | fresh | Three unlocked resources, empty-state hint. |
| `final-m2-cards-progressed-1440x900.jpg` | 1440×900 | progressed | All 19 cards, four category groups, live rates and ETAs. |
| `final-m2-cards-selected-1440x900.jpg` | 1440×900 | progressed | Metal selected — cyan card, hint dismissed. |
| `final-m2-cards-compact-1440x900.jpg` | 1440×900 | progressed | Compact density: 19 resources in dense rows. |
| `final-m2-cards-1024x768.jpg` | 1024×768 | progressed | Compact desktop / tablet. |
| `final-m2-cards-768x1024.jpg` | 768×1024 | progressed | Tablet portrait (ETA line drops). |
| `final-m2-cards-390x844.jpg` | 390×844 | progressed | Phone: single-column dense rows. |
| `final-m2-cards-360x800.jpg` | 360×800 | progressed | Narrowest phone. |
| `final-m2-legacy-fallback-1440x900.jpg` | 1440×900 | fresh | `?resources=legacy` — modern shell, legacy table. |

## Accessibility notes

- Cards are `<button type="button">` with `aria-pressed` — keyboard reachable
  and operable with a visible focus ring, no `tabindex` juggling.
- **State is never colour-alone**: each card carries a glyph + word badge
  (`▲ Producing`, `▼ Draining`, `◆ Full`, `▬ Idle`) *and* a coloured edge strip;
  the rate carries an explicit `+` / `−` / `·` sign glyph.
- Storage meters expose `role="progressbar"` with `aria-valuenow` and a label.
- Icons are `alt=""` / `aria-hidden` decoration; the resource name is real text.
- `prefers-reduced-motion: reduce` removes card transitions and the meter tween.

## Known limitations (intentionally deferred)

- **Live regions.** Values update silently; announcing important transitions
  (storage full, energy deficit) is part of the M5 accessibility pass, not M2.
- **No filter/search.** With 19 resources, grouping plus the density toggle is
  enough; a filter belongs with a larger late-game inventory.
- **The detail panel is still legacy markup.** M2 replaces the resource *list*
  and gives the panel the full width; restyling the panel's internals (gain
  buttons, machine tables, storage upgrades) is not in scope here.
- **Light theme** remains deferred, as in M1 — dark is the canonical identity.
- **Legacy fallback on mobile** still overflows at 390 px (`?ui=legacy`,
  scrollWidth 405). That is the inherited original Bootstrap layout; the card
  dashboard is precisely what fixes it in modern mode.
