# Performance Budgets

Budgets for the modern UI layers (M1–M4) running inside the inherited game loop.
Established in M5a; see [M5A_PERFORMANCE_FOUNDATION.md](M5A_PERFORMANCE_FOUNDATION.md)
for the measurements behind them.

## The tick these budgets live inside

`game.js` registers three intervals: **Fast Update (100 ms)**, Slow Update
(1000 ms) and UI Update (100 ms). Modern components run from `Game.uiComponents`
on the UI Update tick. The 10 Hz cadence is canonical and **must never be
lowered to meet a budget** — that would slow the game rather than the UI.

## Structural budgets (hard)

| Budget | Status |
| --- | --- |
| No additional persistent game/update interval | met |
| No per-card / per-node / per-destination timer | met |
| No unbounded `requestAnimationFrame` loop | met |
| No `MutationObserver` in a steady update path | met |
| No component-root growth after repeated initialisation | met |
| No listener growth after repeated initialisation | met |
| No DOM growth after 20 navigation cycles | met |
| No page-level horizontal overflow in modern mode | met |

## Timing budgets (measured, late game, warm)

| Budget | Target | M4 baseline | M5a |
| --- | --- | --- | --- |
| Combined unchanged modern components, p95 | ≤ 3 ms | 4.9 ms ❌ | **0.9 ms** ✅ |
| Any single unchanged modern component, p95 | ≤ 1 ms | M2 1.2 ms ❌ | **~0.3 ms** ✅ |
| No modern update routinely exceeds one frame | ≤ 16.7 ms | met | met |
| `Game.ui.updateBoundElements`, p95 | as low as practical | 11.3 ms | **0.4 ms** |
| `Game.fastUpdate`, p95 | — | 12.9 ms | **1.6 ms** |

Not yet measured (deferred with the features that need them): changed-state
update p95 ≤ 8 ms; interaction-to-first-frame; pan/zoom frame cadence; long-task
counts; layout/paint counts; notification-burst behaviour.

## Long-session budgets

| Budget | Status |
| --- | --- |
| Formatter cache ≤ 4096 entries | met — steady state ~400, 0 evictions in gameplay |
| Component roots unchanged over a session | met |
| Interval count unchanged | met |
| DOM stable except canonical transient notifications | met |
| No monotonic retained-heap growth attributable to modern UI | met |

## Measurement rules

1. Real Chrome, isolated contexts, synthetic states via canonical paths only.
2. ≥ 300 warm samples after ≥ 30 warm-up iterations; report p50, p95 **and** max.
3. Compare before/after **in the same page** where possible.
4. State whether DevTools instrumentation was attached and whether GC was forced.
5. Never discard samples without saying so and why.
6. A missed budget is reported as missed, with evidence — never redefined.
