# M5a — Performance Foundation

The first slice of M5: the modern UI runtime, the formatter memoisation that
removes the game's dominant per-tick cost, and the removal of the last
third-party runtime request.

**M5a is not M5.** Accessibility, keyboard navigation, notifications, the
settings panel and audio are explicitly *not* delivered here — see §10.

## 1. The bottleneck

Profiling the deployed M4 build (`2da73f33`) in real Chrome found one dominant
cost, and it was not in any M1–M4 code:

| Late-game measurement | p50 | p95 | max |
| --- | --- | --- | --- |
| `legacyRefreshUI` | 0 | 0.1 | 0.2 |
| M2 dashboard update | 1.1 | 1.2 | 2.1 |
| M3 signature / update | 0 | 0.1 | 0.1 |
| M4 signature / update | 0 | 0.1 | 0.2 |
| combined modern components | 4.3 | **4.9** | 5.6 |
| **`Game.ui.updateBoundElements`** | 10.7 | **11.3** | 13.2 |
| `Game.fastUpdate` | 12.2 | **12.9** | 13.5 |

`updateBoundElements` was **85% of all per-tick work**, running at 10 Hz.

Instrumenting it: **629 bound elements re-evaluated every tick, ~1 of which
changes**. All of the cost is `valueLambda()`; DOM writes measured 0 ms because
`DataBoundElement.update` already skips writes when the value is unchanged.
About 626 of those lambdas call `Game.settings.format`, whose
`formatEveryThirdPower` ends in `Number.prototype.toLocaleString` — the full
Intl machinery, measured at **~16.7 µs per call**. Cost was identical for stable
and continuously-changing values, confirming no caching existed anywhere.

## 2. Dependency audit (Phase A)

`Game.settings.format` is memoisable only if its output is a pure function of
inputs the cache key captures. Established by source inspection, not assumption:

| Candidate input | Mutable at runtime? | In key? |
| --- | --- | --- |
| numeric `value` | yes | **yes** |
| `digit` (precision) | yes | **yes** |
| `Game.settings.entries.formatter` | **yes** — see below | **yes** |
| formatter function identity | no — `formatters` is built once and never reassigned | n/a |
| suffix/notation tables | no — captured in closures when `formatters` is built | n/a |
| `Game.utils.decimalSeparator` | no — a load-time IIFE constant | n/a |
| `StrLoc` localisation | no — identity function defined once at load | n/a |
| browser locale (`toLocaleString`) | no — fixed for the page lifetime | n/a |

`instance.format` reads **exactly one** setting (`this.entries.formatter`),
asserted by a test that fails if it ever reads another.

**The important case:** `formatter` is persisted in the save and restored by
`Game.settings.load`, which mutates `entries` **in place**. Loading a different
save therefore changes formatting *without replacing the function object*.
Because the key contains the setting value rather than the function identity,
this is handled — and it is tested directly.

The seven shipped formatters are `raw`, `rounded`, `name`, `shortName`,
`shortName2`, `scientific`, `scientific2`.

## 3. Cache design

Structure: a null-prototype object keyed by
`` `${formatter} ${digit || 0} ${value}` ``.

- **Capacity** 4096 entries.
- **Eviction: clear-on-full.** When the cache reaches capacity it is dropped
  wholesale and rebuilt. This is deterministic, O(1), and has no per-entry
  bookkeeping. It is *not* LRU — chosen deliberately, because real gameplay
  never approaches the cap (measured steady-state size: **~400 entries**), so
  a recency policy would add cost for a case that does not occur.
- **Correctness on a miss** is structural: the original function is called and
  its exact return value is stored and returned, so output is byte-identical by
  construction rather than by reimplementation.
- **`-0`** shares a key with `+0` (`String(-0) === "0"`). Verified safe: every
  formatter produces identical text for both, asserted per formatter.
- **Collisions** are impossible for distinct finite numbers because
  `String(number)` is injective over doubles.

### Non-finite policy

Non-numeric and non-finite input **bypasses the cache entirely** and goes
straight to the original. This preserves inherited behaviour exactly, including
the defect below. Nothing non-finite is ever stored.

## 4. Inherited defect: `format(Infinity)` never returns

`formatEveryThirdPower` contains

```js
while (Math.round(value) >= 1000) { value /= 1000; base++; }
```

`Infinity / 1000 === Infinity`, so the loop never terminates. This is **inherited
from the original game and is not fixed in M5a** — fixing it would change legacy
behaviour, which is out of scope. The memo does not make it more likely: the
bypass routes non-finite input to the same original code path it always reached.

It was found when a parity sweep fed `Infinity` to the original and hung.
**No test may execute the original with a non-finite magnitude.** The tests
assert the *routing decision* instead. Recorded as R19 in the risk register.

Normal gameplay does not produce non-finite formatter input: across the measured
fresh/mid/late states, bypass counts were 0–1 per session (the single case being
a deliberate probe), against ~490 000 finite lookups.

## 5. Parity evidence

Deterministic corpus, seed **`0x5EEDC0DE`** (LCG, reported so it is reproducible):

- order-of-magnitude boundaries 10⁰…10²⁴ with ±1 and ±0.1% neighbours;
- rounding boundaries (999.4/999.5/999.6, 1e6±0.5, …);
- integers 0–64, `0`, `-0`;
- 4 000 pseudo-random values spanning 23 orders of magnitude;
- negative equivalents of every positive value.

**≈4 500 values × 7 formatters = ≈31 500 comparisons, 0 mismatches.**
Plus 364 explicit matrix cases across values × digit counts × formatters, and a
6 000-value worst-case unique-input sweep — also 0 mismatches.

In-browser parity against the live game: **2 068 checks, 0 mismatches**.

## 6. Measured result

Memo **off vs on in the same page**, 300 warm samples per measurement after a
30-iteration warm-up, 4 viewports × 5 states = 20 rows. Representative:

| Viewport | State | Metric | off p50/p95/max | on p50/p95/max | p95 |
| --- | --- | --- | --- | --- | --- |
| 1440×900 | late | `updateBoundElements` | 10.7 / 11.3 / 13.2 | 0.3 / **0.4** / 0.7 | **−96.5%** |
| 1440×900 | late | combined modern | 4.3 / 4.9 / 5.6 | 0.7 / **0.9** / 1.2 | **−81.6%** |
| 1440×900 | late | `Game.fastUpdate` | 12.2 / 12.9 / 13.5 | 1.3 / **1.6** / 12.3 | **−87.6%** |
| 360×800 | late/Celestial | combined modern | 4.4 / 5.1 / 5.4 | 0.7 / **0.9** / 1.2 | **−82.4%** |

Every one of the 20 rows lands within −81% and −97% on p95. **No regression at
mobile viewports.** Cache hit rate **99.92–99.93%** (~490 000 hits vs ~400
misses per row), steady-state size ~400, **0 evictions in real gameplay**.

Note the `fastUpdate` "on" max of ~12 ms: that is the **first** post-warm-up
sample populating cold entries, not steady-state. p50/p95 are 1.3/1.6 ms.

### Budgets

| Budget | Result |
| --- | --- |
| combined modern p95 ≤ 3 ms | **met** — 0.8–0.9 ms on all 20 rows (was 4.9 ms, failing) |
| single modern component p95 ≤ 1 ms | **met** — M2 1.2 → ~0.3 ms; M3/M4 already ≤ 0.1 ms |
| no modern update routinely > 16.7 ms | **met** |
| zero added intervals / rAF / observers / timers | **met** |
| canonical 10 Hz tick unchanged | **met** — untouched |

## 7. What else M5a ships

- **`sc.ui.*` preference store** — `motion`, `announcements`, `audioEnabled`
  (default **false**), `audioVolume`, alongside M2's existing `resourceDensity`.
  Nothing is written until the user changes something; corrupted values fall
  back; volume clamps to 0–1; unknown keys are rejected; unavailable storage
  never throws. Reset removes exactly the `sc.ui.*` keys and leaves
  `localStorage["save"]` byte-identical.
- **Motion foundation** — one decision (`prefersReducedMotion()`) published as
  `<html data-motion>`, with CSS honouring it and a loader that dims rather than
  freezing. **Dormant**: no surface consumes it for its own animations yet.
- **Announcer** — one polite (`role="status"`) and one assertive
  (`role="alert"`) region, with hydration silence, deduplication, burst
  coalescing, a 900 ms floor and preference gating. **Dormant**: it is not wired
  to any game event, so no announcements fire during play.
- **Google Fonts removed** — see §8.

## 8. Font

The runtime request to `fonts.googleapis.com` is gone. The display face resolves
from a local stack: `Orbitron` (when the user has it installed), then Eurostile,
Bank Gothic, Michroma, Bahnschrift, DIN Alternate, Avenir Next Condensed,
Futura, Trebuchet MS, finally the UI stack. No font is self-hosted, so no new
font licence obligation is introduced. **0 font requests** to any provider,
verified across 10 viewport/mode rows.

## 9. Methodology

Real Chrome (`headless: 'shell'`) via temporary `puppeteer-core` outside the
repository. Isolated browser contexts; synthetic states built through canonical
paths; **never a real player save**. 300 warm samples after 30 warm-up
iterations, p50/p95/max from the sorted sample. Memo off/on measured **in the
same page** by restoring `__scOriginal`, so hardware and page state are
controlled for. DevTools instrumentation was **not** attached during timing.
`--expose-gc` was enabled and `gc()` **was forced** at each soak checkpoint;
this is stated because forced GC changes the shape of a heap series.

## 10. Not delivered — remaining M5 scope

| Slice | Work |
| --- | --- |
| **M5b** | Keyboard interaction model; WCAG audit, contrast, target sizes, semantics; wiring the announcer to real events (storage full, energy deficit, affordability, travel, save/import). |
| **M5c** | Notification centre with visible caps, queueing, grouping and burst control; settings panel; optional audio. |
| **M5d** | Shared map viewport controls (zoom/pan/reset/fit) for M3 and M4; frame/interaction traces; the full 6-viewport × 8-state × 6-input QA matrix; remaining screenshots. |

Also outstanding: `docs/ACCESSIBILITY.md`, and the motion/announcer foundations
becoming live rather than dormant.
