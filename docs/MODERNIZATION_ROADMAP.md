# Modernization Roadmap

A staged plan to modernize Space Company **without breaking gameplay, balance,
or saves**. Each milestone is independently shippable and preserves the
invariants in [SAVE_COMPATIBILITY.md](SAVE_COMPATIBILITY.md).

Guiding principles:

- **Non-destructive first.** Add scaffolding and shells before changing behaviour.
- **Characterize before refactor.** Lock observable behaviour in tests, then move code under it.
- **Saves are sacred.** No milestone changes save keys, serialization, or economy without an explicit, tested migration.
- **`gh-pages` stays deployable** until M8 explicitly migrates deployment.

## M0 — Foundation & characterization ✅ (this milestone)

- Repository forensics and a risk register.
- Reproducible, zero-dependency local tooling: static server, deterministic
  build, syntax lint, test runner.
- Characterization + save-safety tests around number formatting, initial state,
  cost/affordability, the tick engine, offline/reset guards, and the full
  save/load and import/export round-trip.
- Documentation: architecture, save compatibility, roadmap, visual direction.
- **No gameplay, balance, progression, or save-format changes.**

## M1 — Visual design system & non-destructive shell ✅ (merged into `dev`)

- ✅ Introduced the design tokens from [VISUAL_DIRECTION.md](VISUAL_DIRECTION.md)
  (`styles/modern/tokens.css`) — layered over Bootstrap, scoped to
  `html[data-ui="modern"]`, with a `?ui=legacy` fallback.
- ✅ Built a command-center shell (instrumentation header, command-strip nav,
  glass workspace, cinematic loader) hosting the existing legacy panels
  unchanged; deep-space CSS canvas; legacy component compatibility layer.
- ✅ Removed inherited Google Analytics + Kongregate script (see
  [PRIVACY.md](PRIVACY.md)); documented the DOM contract
  ([UI_DOM_CONTRACT.md](UI_DOM_CONTRACT.md)) and acceptance
  ([M1_VISUAL_ACCEPTANCE.md](M1_VISUAL_ACCEPTANCE.md)).
- ✅ No changes to game logic, balance, progression, or the save schema/DOM
  contract the legacy JS depends on.
- Deferred to M2: the true responsive resource dashboard (M1 only lightly
  restyles the resource rows).

## M2 — Modern responsive resource dashboard ✅ (merged into `dev`)

- ✅ Replaced the fixed-380px, four-column resource table with a responsive
  **resource-card dashboard** (`ui/modern/resourceDashboard.js`,
  `styles/modern/resources.css`) — icon, state badge, current/capacity with a
  storage meter, signed per-second rate and time-to-full/empty, grouped by
  category, with a comfortable/compact density control.
- ✅ The dashboard is a **projection of the legacy list**: identity, grouping,
  lock state, selection, values and formatting are all read from the legacy rows
  and the game's own accessors/delegates, and a card click dispatches a real
  click on its `<tr>`. Parity is structural, not hand-maintained.
- ✅ **Read-only view replacement** — no gameplay, balance, progression, economy
  or save-schema change; `localStorage["save"]` is never touched.
- ✅ Legacy view kept as a fallback: `?resources=legacy` (modern shell, legacy
  table) and `?ui=legacy` (original presentation). The legacy column is hidden
  only while the dashboard is genuinely in the DOM, so a failed build falls back
  on its own.
- ✅ Reclaims the width the 380px float consumed — the detail panel now fills the
  workspace, closing M1's "desktop horizontal whitespace" limitation.
- Evidence: [M2_RESOURCE_DASHBOARD.md](M2_RESOURCE_DASHBOARD.md).
- Deferred to M5: live-region announcements for storage-full / energy-deficit.

## M3 — Technology graph & progression command center 🚧 (implemented on `feature/m3-...`, pending review)

- ✅ Replaced the flat `#techTable` with a **technology map**
  (`ui/modern/techGraph.js`, `ui/modern/techCommandCenter.js`,
  `styles/modern/research.css`): stage columns flowing left→right, themed lane
  bands, SVG connectors with direction arrows, a progression header, a legend,
  a frontier focus control and a selected-technology inspector.
- ✅ The map is a **read-only projection** of `Game.tech` / `Game.techData`.
  Edges are derived only from canonical `newTechs`; nothing infers a
  prerequisite. Technologies unlocked from outside `newTechs` (`unlockPSU` via
  `core.js`, the Sol Center trio, the four science-threshold upgrades) are
  flagged and explained rather than given invented edges.
- ✅ **Canonical purchase only.** Researching dispatches a real click on the
  legacy `<button onclick="purchaseTech('…')">`, falling back to
  `purchaseTech(id)`; never both, exactly once. No science is deducted, no
  `apply`/`onApply` is called, and `unlocked`/`current` are never written by
  modern code.
- ✅ **Spoiler-safe.** Concealment is enforced in the model: an undiscovered
  technology exposes the literal name `"Undiscovered"`, a `null` cost and no
  effects, and is removed from the tab order and the accessibility tree.
- ✅ Distinct **mobile pathway** below 900px — a vertical, stage-grouped
  progression rather than a shrunken map. Tablet behaviour was chosen on real
  viewport evidence (1024 keeps the map, 768 switches).
- ✅ No gameplay, balance, progression, economy or save-schema change; M3 stores
  nothing in `localStorage`, not even a preference key.
- ✅ Fallbacks: `?research=legacy` (modern shell, legacy table) and `?ui=legacy`
  (original presentation). Both URL-only, both byte-verified against the save.
- Evidence: [M3_VISUAL_ACCEPTANCE.md](M3_VISUAL_ACCEPTANCE.md); architecture in
  [M3_TECHNOLOGY_GRAPH.md](M3_TECHNOLOGY_GRAPH.md) and
  [M3_TECHNOLOGY_CONTRACT.md](M3_TECHNOLOGY_CONTRACT.md).
- Deferred to M4/M5: a zoom-out control for the map, live-region announcements,
  and edge-crossing minimisation if the data ever gains multi-parent nodes.

## M4 — Celestial operations & interstellar navigation 🚧 (implemented on `feature/m4-...`, pending review)

- ✅ Replaced the solar-system navigation column with an **orbital command
  center** (`ui/modern/celestialModel.js`, `ui/modern/celestialCommandCenter.js`,
  `styles/modern/celestial.css`): deterministic orbital map, interstellar
  network, destination inspector, frontier focus and a vertical mission route on
  phones.
- ✅ **Read-only projection.** 14 solar destinations, 13 routes and 79 star
  systems derived from the legacy rows, `explored[]`, the published fuel-cost
  spans and `Game.interstellar.*`. No cost, formula or unlock rule is copied.
- ✅ **Canonical actions only.** Exploring clicks the legacy
  `<button onclick="explore('X')">` or `#star_<id>_explore`; selecting clicks the
  destination `<tr>`. Measured in Chrome: fuel 30 → 10 for a cost-20 Moon,
  statistic +1, successor revealed, repeat dispatch inert.
- ✅ Fixed the inherited **79 duplicate IDs** (`star_<id>_name` emitted by two
  templates) → **0**, with zero consumers affected.
- ✅ Added `?space=legacy`; `?ui=legacy`, `?resources=legacy` and
  `?research=legacy` all still behave, in every combination, save byte-identical.
- ✅ No gameplay, balance, progression, economy or save-schema change.
- Evidence: [M4_CELESTIAL_OPERATIONS.md](M4_CELESTIAL_OPERATIONS.md).

## M5a — Performance foundation 🚧 (implemented on `feature/m5-...`, pending review)

- ✅ Found and removed the game's dominant per-tick cost: `updateBoundElements`
  re-evaluated 629 bound lambdas every 100 ms, ~626 of which called
  `Game.settings.format`, whose `toLocaleString` measured ~16.7 µs per call —
  85% of all per-tick work. A bounded, byte-identical memo cut combined modern
  work p95 from **4.9 ms to 0.9 ms** (inside the 3 ms budget it was failing) and
  `Game.fastUpdate` p95 from **12.9 ms to 1.6 ms**, across 4 viewports × 5 states.
- ✅ Removed the last third-party runtime request (`fonts.googleapis.com`).
- ✅ Added the `sc.ui.*` preference store, the motion foundation and a single
  pair of live regions — the last two **dormant** until M5b wires them.
- Evidence: [M5A_PERFORMANCE_FOUNDATION.md](M5A_PERFORMANCE_FOUNDATION.md),
  budgets in [PERFORMANCE_BUDGETS.md](PERFORMANCE_BUDGETS.md).

## M5b/M5c/M5d — Accessibility, notifications, viewport controls (not started)

- Keyboard model, WCAG audit and contrast, announcement wiring (M5b).
- Notification centre with burst control, settings panel, optional audio (M5c).
- Shared map zoom/pan/reset for M3 and M4, interaction traces, full QA matrix (M5d).

## M5 — Accessibility, motion & audio polish

- Keyboard navigation, focus management, ARIA, reduced-motion support, colour
  contrast (see accessibility constraints in VISUAL_DIRECTION.md), optional audio.

## M6 — Modular game-engine extraction

- Extract the simulation (state, tick, production, persistence) from the DOM
  into testable modules behind a stable interface. Introduce a real build/module
  system. **Save format preserved**; the characterization suite is the safety net.

## M7 — New gameplay, events & lore

- Only after the engine is modular and well-tested: additive gameplay, events,
  and lore. Any economy/schema change ships with a tested forward migration.

## M8 — Production deployment & save-migration verification

- Modern deploy pipeline; migrate deployment off the legacy `gh-pages` flow.
- End-to-end verification that real legacy saves migrate correctly, with
  documented rollback to `gh-pages`.

## Tooling trajectory

M0 is deliberately zero-dependency (Node stdlib only). A module system and
bundler are introduced no earlier than **M6**, when the engine is extracted —
not for cosmetic milestones. No heavyweight UI framework is adopted in M0; any
such decision is deferred to its relevant milestone and evaluated against the
"saves are sacred / non-destructive" principles above.
