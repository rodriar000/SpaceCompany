# M4 — Celestial Operations, Solar-System & Interstellar Navigation

The orbital map, interstellar network and destination inspector that replace the
inherited solar-system navigation column. Like M2's resource dashboard and M3's
technology graph, this is a **projection over the canonical game**, not a
reimplementation.

## 1. Canonical sources

Everything the view shows is read from the shipped game:

| Fact | Canonical source |
| --- | --- |
| Destination reachability | `<tr id="<bodyId>">` — `.hidden` while unreached |
| Current selection | the same row — `activeSolarTab()` appends `info` |
| Exploration state | `explored[]`, plus `<tr id="explore<Body>">` visibility |
| Fuel cost | `#<bodyId>RocketFuelCost` (static integers, written by no script) |
| Fuel held | `getResource(RESOURCE.RocketFuel)` |
| Launch state | `rocket`, `rocketLaunched` |
| Exploration action | `explore('<Body>')`, via its legacy `<button>` |
| Star roster / progress | `Game.interstellar.stars.entries[id]` (`distance`, `explored`, `owned`) |
| Star discovery | the star's own `<tr id="star_<id>">` hidden state |
| Telescope reach | `Game.interstellar.comms.entries.IRS.count + astroBreakthrough.count * 5` |
| Interstellar travel gate | `Game.interstellar.rocket.entries.tier1Rocket.built` |
| Star action | `Game.interstellar.stars.exploreSystem(id)`, via `#star_<id>_explore` |

`ui/modern/celestialModel.js` reads these. `ui/modern/celestialCommandCenter.js`
renders them and dispatches clicks. Neither owns any of it.

**Prohibited and enforced by test:** no write to a resource, flag, exploration
list, unlock array or save field; no call to `explore()`, `exploreSystem()`,
`launchRocket()` or `getRocket()`; no `localStorage`; no copied cost or formula;
no second loop, timer or `MutationObserver`.

### The one cost that is not read numerically

The antimatter price of a star is `distance * 10000` inside `star.js`. Copying
that multiplier would duplicate a canonical cost formula, which the M4 contract
forbids, and the rendered `#star_<id>Cost` span is already number-formatted so
it cannot be parsed back reliably. The model therefore shows the **cost text**
and the **antimatter held** side by side and lets the canonical
`exploreSystem()` enforce the real check. Star readiness is reported from
observable state (discovered + rocket built), never from a recomputed price.
This is a deliberate, documented limitation.

## 2. Progression model

**14 solar destinations** (1 launch site, 6 planets, 1 moon, 2 belts,
1 station, 1 special site, plus survey stops), **13 routes**, **79 star systems**.

```
Launch Vehicle ──▶ Moon · Mercury · Venus · Mars · Asteroid Belt      (inner)
                                        └─▶ Wonder Station · Jupiter · Saturn
                                            Uranus · Neptune · Pluto · Kuiper Belt   (outer)
                                                                    └─▶ Sol Center
Sol Center / Wonders ──▶ Interstellar network (79 systems, gated by telescope reach)
```

Routes are derived from the DOM writes `launchRocket()` and `explore()` actually
perform, and `test/celestialOperations.test.mjs` re-reads `solarSystem.js` to
prove the registry still matches — including asserting that **every** entry in
the canonical `planetsData` is modelled, so a destination can never be silently
dropped.

### Documented special case: survey-only bodies

**Mercury, Uranus and Neptune** are navigable and described but have no entry in
`planetsData` — the game says outright they are "not worth exploring". They are
modelled as `survey` destinations with no action. A test fails if any of them
ever gains an explore action, so the exception cannot rot.

## 3. States and spoiler policy

| State | Meaning | Cue |
| --- | --- | --- |
| `ready` | reachable and affordable | ▶ "Ready" |
| `blocked` | reachable, not enough fuel / no interstellar rocket | ✕ "Insufficient fuel" |
| `explored` | already explored, or launch vehicle spent | ✓ "Explored" |
| `completed` | star system conquered | ✦ "Conquered" |
| `survey` | navigable, nothing to explore | ◎ "Survey only" |
| `undiscovered` | not yet reached | ◇ "Unsurveyed" |

Concealment is enforced **in the model**: an unreached destination exposes only
`publicLabel` (`"Unsurveyed"` / `"Uncharted system"`), with `publicCostText`,
`publicDistance` and `publicFaction` all `null`. The view may render only
`public*` fields, so a template change cannot leak. Concealed nodes are
`tabindex="-1"` and `aria-hidden="true"`, so the concealment holds for keyboard
and screen-reader users too. Locked legacy tabs stay `display:none`.

The one deliberate exception to full concealment is **position**: a destination's
slot on the map exists from the start, so the player can see that the system has
an outer region without learning what is in it. No name, cost, faction or
description is ever exposed before the canonical row un-hides.

## 4. Layout

Deterministic polar placement — no DOM measurement, no physics, no animation
loop. Ring = progression stage (`0` launch, `1` inner, `2` outer, `3` core);
angle = `ringStart + index * 360/count`. The launch site is parked outside the
orbits because it is not an orbital body (it used to overlap the Moon). The
canvas is a fixed 660 × 660.

Stars are ordered nearest-first, ties broken by id, so the order never wobbles.

**Frontier priority** (documented and tested): an affordable solar destination
(cheapest first) → a star ready to explore (nearest first) → an available but
unaffordable solar destination → otherwise the last place actually reached. A
destination that cannot be acted upon is never recommended above one that can.

## 5. Action delegation

```
node / inspector button
  └─ solar: click the legacy <button onclick="explore('X')">
     star : click the legacy #star_<id>_explore control
        └─ the canonical function runs unchanged
```

Never the underlying function as well, never twice; a re-entrancy flag closes
the window in which the synchronous re-render could re-enter. Selection
dispatches a real click on the destination's `<tr>`, so both
`activeSolarTab(...)` and Bootstrap's tab data-api run exactly as for a legacy
click.

**Measured in Chrome** (Moon, cost 20): fuel 30 → 10, `explored` → `['moon']`,
`placesExplored` 0 → 1, successor resource `lunariteNav` revealed, state
`explored`. Repeating the action returns `false` with no further deduction; an
unaffordable action leaves a full state snapshot byte-identical.

## 6. Responsive behaviour

| Width | Mode | Presentation |
| --- | --- | --- |
| ≥ 901 px | `map` | Orbital map + interstellar grid + sticky inspector |
| ≤ 900 px | `route` | Vertical mission route grouped by stage, full-width cards, ≥ 56 px targets, inspector below |

One DOM serves both: ring sections are `display: contents` in map mode (so
absolute positioning works against the canvas while the DOM keeps a sane
stage-by-stage reading order) and ordinary blocks in route mode. 768 × 1024
resolves to `route` — a 660 px canvas plus a 320 px inspector does not fit.

Focus scrolls the **map container**, never the page.

## 7. Fallbacks

| URL | Celestial | Resources | Research |
| --- | --- | --- | --- |
| default | map | cards | graph |
| `?space=legacy` | legacy panes | cards | graph |
| `?resources=legacy` | map | legacy table | graph |
| `?research=legacy` | map | cards | legacy table |
| `?ui=legacy` | legacy panes | legacy table | legacy table |

All URL-only; M4 stores **nothing** in `localStorage`. Every combination was
verified to leave the save byte-identical.

## 8. Inherited duplicate-ID defect

**Before M4: 79 duplicated ID values**, identical in modern and legacy modes.

Root cause: `ui/interstellarUI.js` rendered every star twice — once by
`starTemplate` (travel list) and once by `factionStarTemplate` (conquest list) —
and **both emitted `id="{{htmlId}}_name"`**. One star, two headings, same id.

The id had **zero consumers**: no selector, function or save path referenced it.
The correction was therefore deterministic and safe — the faction heading now
uses `{{htmlId}}_conquer_name`. The ids that *are* consumed (`_owned`,
`_conquer`, `_explore`, `Cost`) are untouched, so selection, action and save
behaviour are unchanged.

**After M4: 0 duplicated IDs** in the default modern UI, `?space=legacy` and
`?ui=legacy`. This is the only ID changed; no repository-wide cleanup was done.

## 9. Performance and lifecycle

The DOM is built once; node geometry is state-independent, so progress never
moves a node and an update is a diffed text/class refresh. One component in
`Game.uiComponents`, one delegated click listener, one `matchMedia` listener.

| Measurement | Result |
| --- | --- |
| Model build (14 bodies + 79 stars, incl. layout) | **2.01 ms** |
| Structure signature | **0.048 ms** |
| Steady per-tick update | **0.038 ms** |
| Elements after 15 re-initialisations | 21 784 → **21 784** |
| Elements after 20 tab round-trips | 21 784 → **21 784** |
| Game intervals | the shipped 4, unchanged |

Costs are higher than M3's technology graph (0.85 ms build / 0.007 ms steady)
because the model spans 93 destinations rather than 33 and reads the DOM for
each star's discovery state. Both remain far below the 100 ms UI tick.

## 10. Accessibility baseline

Native `<button>`s for every interactive destination; `aria-pressed` for
selection; `aria-label` carrying name, type and state; visible `:focus-visible`
rings; concealed nodes removed from the tab order and the accessibility tree;
decorative SVG marked `aria-hidden`; map and star groups labelled via
`aria-labelledby`; ≥ 44 px controls (≥ 56 px in route mode); reduced-motion
honoured; no live regions (deferred to M5).

## 11. Known limitations, deferred to M5

- **Star affordability is not computed** (see §1) — the cost text and antimatter
  held are shown side by side instead.
- **The interstellar network is a distance-ordered grid**, not a spatial route
  map. A true stellar network needs positions the canonical data does not carry.
- **Conquest (spy / invade / absorb) is not projected.** Selecting an explored
  system routes the player to the canonical interstellar panel.
- **Launch and rocket construction stay in the legacy pane**; the map shows the
  launch site's state but delegates the build/launch controls.
- **Route connectors are not drawn** between orbital nodes; hierarchy is carried
  by rings and by the inspector's "Reached from" field.
- Live-region announcements and the full accessibility pass remain M5.
