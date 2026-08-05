# M3 — Technology Contract

What the modern research view is allowed to know, and what it must never touch.
Written from a full read of `tech.js`, `data/techData.js`, `ui/techUI.js`,
`science.js`, `core.js`, `solCenter.js`, `saving.js`, `variable.js`,
`constants.js` and `notification.js` before any code was changed.

Companion documents: [M3_TECHNOLOGY_GRAPH.md](M3_TECHNOLOGY_GRAPH.md) (how the
graph is built and drawn) and [M3_VISUAL_ACCEPTANCE.md](M3_VISUAL_ACCEPTANCE.md)
(the evidence).

## 1. Canonical state boundary

The research system's truth lives entirely in the legacy code:

| Truth | Owner |
| --- | --- |
| Static definitions, and the **canonical order** of technologies | `Game.techData` (`data/techData.js`) |
| Live `current` (levels owned) and `unlocked` (discovered) | `Game.tech.entries[id]` (`tech.js`) |
| Purchase, clamping, spending, effect application | `Game.tech.buyTech` → `spendResources` → `gainTech` → `applyTechEffect` |
| The player-facing purchase entry point | `purchaseTech(id)` (`science.js:75`) |
| Price of the next level | `getCost(base, current)` (`science.js:98`) |
| Affordability | `Game.tech.hasResources` reading `window[resource]`, i.e. `window.science` |
| Unlock propagation | `techBase.apply` → `Game.tech.unlockTech(newTechs[i])` |
| Resource / tab unlocks | `apply` pushing into `resourcesUnlocked` / `tabsUnlocked` |
| Tab alerts and toasts | `newUnlock(tabAlerts[i])`, `Game.notifySuccess` |
| Persistence | `Game.tech.save` / `.load` (`data.tech = { v: 2, i: { id: { current, unlocked } } }`) |

`ui/modern/techGraph.js` **reads** these. `ui/modern/techCommandCenter.js`
**renders** them and **dispatches** `purchaseTech`. Neither owns any of it.

### Prohibited writes

Neither M3 file may:

- assign `entry.unlocked`, `entry.current`, `entry.cost` or `entry.maxLevel`;
- call `buyTech`, `gainTech`, `removeTech`, `unlockTech`, `apply` or `onApply`;
- deduct `science` or any other resource;
- push into `resourcesUnlocked`, `tabsUnlocked`, `researched` or `available`;
- read or write `localStorage` — **including** a presentation preference key
  (unlike M2's `sc.ui.resourceDensity`, M3 stores nothing at all);
- add, remove or override the legacy `.hidden` class.

Enforced by source-level assertions in `test/techGraph.test.mjs` and
`test/researchCommandCenter.test.mjs`, and by state-snapshot assertions that
compare the whole tech table before and after presentation-only actions.

## 2. The technologies

**33 technologies**: 26 `TECH_TYPE.UNLOCK`, 7 `TECH_TYPE.UPGRADE`. All cost
`science` only, all `COST_TYPE.FIXED` (`buyTech` returns `false` for anything
else, so no other cost type is reachable today).

| Field | Value |
| --- | --- |
| One-shot (`maxLevel === 1`) | 29 |
| Finite multi-level | `energyEfficiencyResearch` (25), `batteryEfficiencyResearch` (200) |
| Infinite (`maxLevel === -1`) | `efficiencyResearch`, `scienceEfficiencyResearch` |
| Unlocked at a fresh start | `unlockStorage`, `unlockBasicEnergy` |
| Carrying an `onApply` | `unlockPlasma`, `upgradeResourceTech`, `upgradeEngineTech`, `upgradeSolarTech` |
| Carrying a `notifyTitle`/`notifyText` | `unlockSolarSystem` only |
| Opening a tab (`newTabs`) | `unlockSolarSystem` → `solarSystemTab` only |

`tabAlerts` values in use: `resources`, `solarSystem`, `solCenter`, `wonder`.

## 3. Graph model

Edges are derived **only** from `newTechs`. 23 edges, and the shipped data is:

- **acyclic** — no cycles;
- **duplicate-free** — no `newTechs` entry is repeated;
- **reference-complete** — every id in every `newTechs` exists;
- **single-parent** — no technology is currently listed by two others.

10 roots (no `newTechs` parent), 15 terminals (no `newTechs` children),
4 orphans (neither).

### Root / orphan / external-unlock rules

A technology with no `newTechs` parent is **not** necessarily reachable at the
start. Three different mechanisms unlock the ten roots, and only the first is
visible in `techData`:

| Root | How it is actually unlocked |
| --- | --- |
| `unlockStorage`, `unlockBasicEnergy` | `unlocked: true` in the data |
| `unlockPlasma`, `unlockEmc`, `unlockDyson` | `solCenter.js` research projects, paid in resources |
| `unlockPSU` | `core.js` `refreshResearches()`, once `unlockPlasma` is purchased |
| `efficiencyResearch`, `scienceEfficiencyResearch`, `energyEfficiencyResearch`, `batteryEfficiencyResearch` | `science.js` `update*Display()`, once `science > base cost` |

**`unlockPSU` is a real dependency that `newTechs` does not state.** The rule
M3 follows: *the graph shows the edges the data states, and says in words what
it cannot show*. Inventing a `unlockPlasma → unlockPSU` edge would make the
picture prettier and the model wrong, so these eight technologies carry an
`externalUnlock` flag and a provenance note surfaced in the inspector instead.
`test/techGraph.test.mjs` re-greps `solCenter.js`, `core.js` and `science.js`
so the notes cannot silently go stale.

### Robustness the current data does not exercise

Verified by tests that mutate the data at runtime: a cycle is reported and
terminates (no infinite recursion, finite depths and coordinates); a dangling
`newTechs` id is reported and dropped rather than rendered; a second parent is
kept; an unmapped technology still lays out.

## 4. Purchase path

```
node "Research" button  (or inspector button)
  └─ click() on the legacy <button id="<id>Button" onclick="purchaseTech('<id>')">
       └─ purchaseTech(id)                              science.js
            ├─ Game.tech.buyTech(id, 1)                 tech.js
            │    ├─ clamp against maxLevel
            │    ├─ cost = current > 0 ? getCost(base, current) : base
            │    ├─ hasResources(cost)         → window.science
            │    ├─ spendResources(cost)       → window.science -= cost
            │    └─ gainTech(id, 1)
            │         ├─ removeTechEffect(id)
            │         ├─ current = min(current + 1, maxLevel>0 ? maxLevel : ∞)
            │         └─ applyTechEffect(id) → apply()
            │              ├─ resourcesUnlocked.push(newResources…)
            │              ├─ tabsUnlocked.push(newTabs…)
            │              ├─ Game.tech.unlockTech(newTechs…)
            │              └─ onApply()
            ├─ Game.statistics.add('techResearched' | 'resourcesUnlocked')
            ├─ refreshResources() / refreshResearches() / refreshTabs()
            ├─ newUnlock(tabAlerts…)
            └─ Game.notifySuccess(notifyTitle, notifyText)
```

M3 enters this chain at exactly one point and exactly once per activation:

1. **Preferred** — dispatch a real `click()` on the legacy button, so the
   canonical inline handler runs exactly as a legacy click would.
2. **Fallback** — call `window.purchaseTech(id)` if that button is absent.

Never both. A re-entrancy flag closes the window in which the synchronous
re-render could route a second call through. The view re-checks `actionable`
and `affordable` before dispatching, so a stale button cannot spend.

The legacy `#techTable` rows and their buttons **remain in the document** and
remain the canonical fallback. Removing them is not an option: `solCenter.js`
does `document.getElementById("unlockPlasma").className = ""` with no null
guard, and `science.js`'s four `update*Display()` passes write to
`#<id>Title` / `#<id>Cost` every 100 ms.

## 5. Completion and repeatable-upgrade semantics

| Situation | Canonical test | M3 state |
| --- | --- | --- |
| Not unlocked, direct successor of something visible | — | `preview` |
| Not unlocked, further out | — | `undiscovered` |
| Unlocked, buyable, affordable | `science >= cost` | `ready` |
| Unlocked, buyable, not affordable | `science < cost` | `blocked` |
| Bought at least once, still buyable | `current > 0 && buyable` | `progressing` |
| One-shot, bought | `maxLevel === 1 && current > 0` | `researched` |
| Levelled, at the cap | `maxLevel > 0 && current >= maxLevel` | `maxed` |

Purchasability is computed as `maxLevel < 0 || current < maxLevel`, mirroring
`buyTech`'s clamp — **not** `Game.tech.isMaxLevel`. See §7.

Completed research is never removed from the map. The legacy table hides a
purchased row (`refreshResearches()` sets `className = "hidden"`); the map keeps
it, marked `Researched`, because "where the company has been" is half the point
of the view.

## 6. DOM contracts introduced by M3

| Selector | Role |
| --- | --- |
| `html[data-research="graph"｜"legacy"]` | Research view mode, set by an inline head script from the URL only. |
| `#scTechCenter` | Root of the command center; first child of `#technologiesTab`. Its existence is what hides `#techTable`. |
| `#scTechCenter[data-layout="graph"｜"path"]` | Map vs vertical pathway; set from `matchMedia('(max-width: 900px)')`. |
| `#scTechViewport`, `#scTechCanvas` | Scroll container and the positioned canvas. **Pan/scroll lives here, never on the page.** |
| `#scTech-<techId>` | One `<article>` per technology, carrying `data-tech` and `data-lane`. |
| `[data-select="<techId>"]` | Selection `<button>` (presentation only). |
| `[data-buy="<techId>"]` | The canonical research `<button>`. |
| `.sc-tech__edge`, `.sc-tech__edge-head` | SVG connectors, `aria-hidden`, `pointer-events:none`. |
| `#scTechInspector`, `#scTechPanel` | Briefing panel; doubles as the frontier readout when nothing is selected. |
| `#scTechFocus`, `#scTechLegendToggle`, `#scTechLegend` | Focus control and legend. |
| `window.SpaceCompanyTechGraph` / `window.SpaceCompanyResearch` | Read-only diagnostic hooks, mirroring M1/M2. |

**Unchanged and load-bearing**: `#techTable`, `<tr id="<techId>">`,
`#<techId>Title`, `#<techId>Cost`, `#<techId>Button`, `#scienceNav`,
`#technologiesNav`, `#scienceTab`, `#technologiesTab`, `#researchTab`,
`#researchTabGlyph`, and every `.hidden` / `.tab-pane` / `.info` behaviour.

The legacy table is hidden by
`#scTechCenter ~ .container #techTable { display: none }`. The sibling
combinator is load-bearing exactly as in M2: if the script fails to build, the
legacy table is still visible and the game is still playable.

## 7. Detected legacy inconsistencies

Recorded, **not fixed** — changing them would change gameplay.

1. **`Game.tech.isMaxLevel` lies about one technology.** It hard-codes
   `if (id == 'energyEfficiencyResearch') return false;`, so a 25/25 Energy
   Efficiency reports "not maxed" and `refreshResearches()` never hides its
   legacy row. `tech.js:load` compensates by deleting `#energyEffButton` on
   load. M3 therefore derives purchasability from `buyTech`'s own clamp, which
   is what actually decides whether science can be spent.
2. **A cost inversion.** `unlockMeteorite` costs 100,000 but its successor
   `unlockMeteoriteTier1` costs 75,000 — cheaper than its prerequisite. Real,
   and left alone.
3. **`unlockPSU` has a hidden prerequisite** (§3): reachable only through
   `core.js`, not through any `newTechs`.
4. **`researched` / `available` are vestigial.** `variable.js` still declares
   them and `saving.js` still restores `researched`, but no current code writes
   them; they exist for `Game.tech.loadV1`'s migration of pre-v2 saves.
   `refreshResearches()` still iterates `researched` and calls
   `getElementById(...).className` **unguarded**, so those ids must keep
   resolving for old saves — another reason the legacy rows stay.
5. **Costs shown to the player are formatter output.** `Game.settings.format`
   with the default `shortName` formatter renders 15,000 as `15.000` and
   9,500,000 as `9,500M`. Odd, but it is what the legacy table shows; M3 calls
   the same formatter with the same number so the two can never disagree.
   Numeric truth is always the raw `cost`, never the string.

## 8. Save compatibility

M3 changes nothing about saving. `Game.tech.save/load`, the `data.tech.v = 2`
shape, the v1 migration and offline handling are untouched; `?research=legacy`
and `?ui=legacy` are URL-only and store nothing. Verified byte-for-byte in
[M3_VISUAL_ACCEPTANCE.md](M3_VISUAL_ACCEPTANCE.md) §5.
