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

## M1 — Visual design system & non-destructive shell

- Introduce the design tokens from [VISUAL_DIRECTION.md](VISUAL_DIRECTION.md)
  (CSS custom properties: colour, type, spacing, surfaces) **without** ripping
  out Bootstrap — layer a new theme on top, behind a feature flag.
- Build a modern app "shell" (header, navigation frame) that hosts the existing
  legacy panels unchanged.
- No changes to game logic or the DOM contract the legacy JS depends on.

## M2 — Modern responsive resource dashboard

- Reimplement the resource list as responsive resource cards driven by the
  **existing** `Game.resources` data — read-only view replacement.
- Keep the legacy view available as a fallback until parity is proven.

## M3 — Research & progression visualization

- Visualize tech/research and progression trees over the existing `Game.tech`
  data. Presentation only; unlock conditions unchanged.

## M4 — Interactive solar-system experience

- Replace the solar-system/interstellar UI with an interactive map over the
  existing `interstellar`/`solarSystem`/`stargaze` state. No progression changes.

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
