# M3 — Visual Acceptance

Evidence for the Technology Graph & Progression Command Center. Architecture is
in [M3_TECHNOLOGY_GRAPH.md](M3_TECHNOLOGY_GRAPH.md); the boundary it respects is
in [M3_TECHNOLOGY_CONTRACT.md](M3_TECHNOLOGY_CONTRACT.md).

## 1. How the evidence was produced

Real Chrome (`/Applications/Google Chrome.app`, `headless: 'shell'`) driven by a
**temporary** `puppeteer-core` installed outside the repository, so the project
stays zero-dependency (`devDependencies: {}`) and `npm test` stays Node-stdlib
only. Pages are served over HTTP by `node scripts/serve.mjs`; viewports are set
with `page.setViewport` (the Chrome extension clamps to the physical display and
cannot reach 1440 px or sub-500 px widths).

Progressed states use the **canonical paths**: science is credited, then the
real `purchaseTech(id)` is called for each technology in dependency order, and
the externally-gated ones are opened with `Game.tech.unlockTech(id)` — the same
method `solCenter.js` calls. Nothing is hand-written into the graph.

- **Initial** — a fresh game.
- **Mid-game** — 11 technologies researched, 5 M science.
- **Late-game** — 29/29 one-shot technologies researched, 8 B science.

## 2. Screenshot matrix

| File | Viewport | State | Mode |
| --- | --- | --- | --- |
| `screenshots/m3-tech-initial-1440x900.jpg` | 1440×900 | initial | map |
| `screenshots/m3-tech-midgame-1440x900.jpg` | 1440×900 | mid | map |
| `screenshots/m3-tech-lategame-1440x900.jpg` | 1440×900 | late | map |
| `screenshots/m3-tech-midgame-1024x768.jpg` | 1024×768 | mid | map |
| `screenshots/m3-tech-midgame-768x1024.jpg` | 768×1024 | mid | pathway |
| `screenshots/m3-tech-initial-390x844.jpg` | 390×844 | initial | pathway |
| `screenshots/m3-tech-midgame-390x844.jpg` | 390×844 | mid | pathway |
| `screenshots/m3-tech-lategame-390x844.jpg` | 390×844 | late | pathway |
| `screenshots/m3-tech-midgame-360x800.jpg` | 360×800 | mid | pathway |
| `screenshots/m3-tech-legacy-1440x900.jpg` | 1440×900 | mid | `?research=legacy` |

## 3. Automated checks, per viewport

Every row of the matrix passed all of the following. No exceptions, no waivers.

| Check | Result |
| --- | --- |
| `innerWidth` / `innerHeight` match the request exactly | ✅ 10/10 |
| `documentElement.scrollWidth <= innerWidth` (no page-level h-overflow) | ✅ 10/10 |
| Exactly one `#scTechCenter` (single initialisation) | ✅ |
| 33 nodes, 33 unique `data-tech` ids, 0 duplicates | ✅ |
| 23 connectors, 23 arrowheads, 0 ending anywhere but on a real node | ✅ |
| Connectors `pointer-events: none` + `aria-hidden="true"` | ✅ |
| 0 overlapping node bounding boxes | ✅ |
| 0 clipped names, costs, levels or buttons | ✅ |
| Graph state vs canonical `Game.tech` (`unlocked` + `current`) | ✅ 0 mismatches |
| Concealed technologies leaking a name or cost — model fields | ✅ 0 |
| Concealed technologies leaking a name into the DOM | ✅ 0 |
| Duplicate visible purchase controls | ✅ 0 |
| Exactly one active top-level `.tab-pane` | ✅ |
| Console errors | ✅ 0 |
| Failed first-party requests | ✅ 0 |
| Analytics / Kongregate / Discord requests | ✅ 0 |

State distribution confirms the visibility policy behaves across the run:

| State | Initial | Mid | Late |
| --- | --- | --- | --- |
| Researched | 0 | 11 | 29 |
| In progress | 0 | 0 | 1 |
| Ready | 0 | 7 | 3 |
| Not enough science | 2 | 4 | 0 |
| Undiscovered · next | 4 | 7 | 0 |
| Undiscovered | 27 | 4 | 0 |

## 4. Purchase parity (real Chrome, canonical path)

| Assertion | Result |
| --- | --- |
| Science deducted for `unlockStorage` | 5 — exactly the canonical cost |
| `current` after one click | 0 → 1 |
| `techResearched` statistic | 0 → 1 (**fired once**) |
| `refreshResources` / `refreshResearches` / `refreshTabs` | 1 / 1 / 1 |
| Successor `unlockOil` unlocked by `apply()` | ✅ |
| Map and inspector updated without another tick | ✅ (0.10 ms) |
| Repeatable `efficiencyResearch` | 100,000 spent, level 0 → 1, once |
| Second level charged at `getCost(base, 1)` | ✅ |
| Clicking a completed one-shot again | no spend, no level, no statistic |

## 5. Save and fallback integrity

A mid-game save was produced, then reloaded three ways and compared
**byte-for-byte**:

| Load | `localStorage["save"]` | Map | `#techTable` | Progress |
| --- | --- | --- | --- | --- |
| default | **unchanged** | present | hidden | 11 researched |
| `?research=legacy` | **unchanged** | absent | visible, 11 live buttons | 11 researched |
| `?ui=legacy` | **unchanged** | absent | visible | 11 researched |

Neither query parameter writes anything; M3 stores no preference key at all.

## 6. Idempotency and performance

| Measurement | Result |
| --- | --- |
| Elements after 10 re-initialisations | 21 182 → **21 182** |
| Elements after 20 Resources↔Research round-trips | 21 182 → **21 182** |
| Nodes / connectors / buy buttons throughout | 33 / 23 / 33 |
| Click listeners on the whole map | **1** (delegated) |
| Graph construction | 0.85 ms |
| Structure signature | 0.007 ms |
| Steady per-tick update | 0.0055 ms |
| Purchase → rendered | 0.10 ms |

## 7. M2 regression

The resource dashboard is unaffected: `#scResourceDashboard` present, 19 cards
rendered, mode `cards`, navigation still isolates a single pane, no console
errors. `test/m2ResourceView.test.mjs` and `test/resourceDashboard.test.mjs`
remain green.

## 8. Critical assessment

**What works.** The map reads as an engineered progression rather than a card
grid: stage columns run left to right, themed lane bands run across, chains such
as Batteries T1→T4 and Meteorite T1→T2 render as single straight runs, and
arrowheads state direction explicitly. Completed paths draw solid and energised
while future ones stay dashed and faint, so "where the company has been" is
legible at a glance. The frontier is signalled four ways — cyan-glowing node
borders, a `Ready to research` badge, the `Affordable now` counter, and the
cheapest-first readout in the side panel. The initial state is the strongest
proof of the spoiler policy: two available technologies, four fog markers reading
`Undiscovered · next`, and everything beyond that dimmer still, with no name or
cost anywhere.

**What was fixed during acceptance, not shipped around.** Five real defects were
found by looking at the rendered output rather than trusting the audits: the
`[data-layout]` selectors were scoped to `<html>` instead of `.sc-tech`, so
absolute positioning never applied and every connector dangled in empty space;
node content overflowed a 132 px card whenever a name wrapped to two lines;
completed cards showed a bare "No further levels" where their effect belonged;
the standalone efficiency upgrades each burned a near-empty grid row, which made
the map read as mostly emptiness; and a literal NUL byte had crept into an edge
key, silently making the source file unreadable to `grep` and every other text
tool. A sixth change — narrowing cards to 196 px to fit more stages — was
implemented, caught clipping in the audit, and reverted.

**What is genuinely imperfect.** Seven stages of 216 px cards do not fit 1290 px
of workspace, so the map pans horizontally at 1440 px and the opening view shows
roughly two-thirds of the columns. This is honest for a tech tree and the pan is
confined to the workspace, but a zoom-out control would serve better and is the
obvious M5 addition. Lanes that begin deep (Power at stage 3, Science at stage 4)
leave real whitespace to their left; band rectangles were tightened to hug their
occupied columns, which removes the "empty container" impression but not the gap
itself. And the number formatting inherited from `Game.settings.format` renders
15,000 as `15.000` — odd, but it is exactly what the legacy table shows, and
matching it was the correct call over quietly improving it.

**Blocker checklist.** Unstructured card grid — no. Unclear direction — no.
Connectors over nodes — no (behind, `pointer-events: none`, 0 overlaps). Late-game
spaghetti — no (3 cross-lane edges, 0 collisions). Undiscovered leakage — no
(0 in the model, 0 in the DOM, concealed nodes out of the a11y tree). Frontier
hard to find — no. Completed history disappearing — no. Clipping — no.
Mobile as a shrunken desktop graph — no (a distinct vertical pathway).
Inspector disagreeing with the node — no. Duplicate or double-firing purchase —
no. Graph lagging canonical state — no (0 mismatches, 0.10 ms). Detached from
M1/M2 — no (same tokens, same glass surfaces, same command-strip language).
Page overflow — no. Broken fallbacks — no.
