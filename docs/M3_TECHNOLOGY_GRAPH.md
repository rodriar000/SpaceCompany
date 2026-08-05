# M3 — Technology Graph & Progression Command Center

How the research view is built. The boundary it works inside is in
[M3_TECHNOLOGY_CONTRACT.md](M3_TECHNOLOGY_CONTRACT.md); the evidence is in
[M3_VISUAL_ACCEPTANCE.md](M3_VISUAL_ACCEPTANCE.md).

## Files

| File | Role |
| --- | --- |
| `ui/modern/techGraph.js` | Read-only projection: nodes, edges, states, visibility, deterministic layout, connector geometry. No DOM. |
| `ui/modern/techCommandCenter.js` | Renders that projection into `#technologiesTab`; owns selection, the inspector and the purchase dispatch. |
| `styles/modern/research.css` | The map, the node, the inspector, the pathway mode. Scoped to `html[data-ui="modern"][data-research="graph"]`. |

Split deliberately: the model is pure enough to test against the real
`data/techData.js` with no DOM at all, which is where most of the guarantees in
the contract are actually verified.

## 1. Projection strategy

`SpaceCompanyTechGraph.build()` walks `Object.keys(Game.techData)` — the same
order `Game.tech.initialise()` uses — and produces one node per technology:

- identity and copy: `id`, `name`, `desc`, `actionLabel` (the canonical
  `buttonText`);
- economy: `cost` (a **number**, from `techData` via `getCost`), `costText`
  (the same number through `Game.settings.format`), `affordable`, `missing`;
- progress: `current`, `maxLevel`, `repeatable`, `levelled`, `purchased`,
  `unlocked`, `buyable`;
- topology: `prerequisites`, `children`, `depth`;
- provenance: `externalUnlock`, `externalUnlockNote`;
- presentation: `lane`, `col`, `row`, `x`, `y`, `visibility`, `state`,
  and the `public*` fields (see §2).

Rules the model holds itself to:

- **edges come only from `newTechs`** — no prerequisite is ever inferred;
- **references are validated** — an unknown id is recorded in
  `diagnostics.missingReferences` and dropped, never rendered;
- **cycles are survivable** — depth uses a longest-path walk with a re-entry
  guard, so a future accidental cycle produces finite coordinates and a
  `diagnostics.cycles` entry instead of a stack overflow;
- **order is stable** — node order is canonical data order, so two builds are
  byte-identical;
- **no formatted string is ever numeric truth** — affordability compares
  `science >= node.cost`, never a rendered label.

Live state is read from `Game.tech.entries` when the subsystem has initialised
and from `Game.techData` before that, so the view is safe to build at any point
in the boot sequence.

## 2. Visibility and spoiler policy

Canonical discovery is the only input:

| Visibility | Condition | What is rendered |
| --- | --- | --- |
| `visible` | `unlocked` or `current > 0` | Everything: name, type, cost, level, effects, action |
| `preview` | a direct successor of something `visible` | A node-shaped marker reading **"Undiscovered · next"** |
| `undiscovered` | anything further out | A fainter marker reading **"Undiscovered"** |

Concealment is enforced **in the model**, not in the view: a concealed node's
`publicName` is the literal string `"Undiscovered"`, its `publicCost` is `null`,
`publicEffects` is empty and `actionable` is `false`. The view is only permitted
to render `public*` fields, so a future template change cannot leak content by
accident. Concealed nodes are also removed from the tab order and marked
`aria-hidden`, so the concealment holds for screen-reader users too.

**Shape is shown; content is not.** All 33 nodes always occupy their cell, so
the map's outline is visible from the first minute while names, costs and
effects stay hidden until canonically discovered. This is a deliberate
trade-off with two payoffs: the player can see that a branch *exists* and in
which direction it runs (which is the point of a tech map), and the layout is
completely stable — nothing shifts position as the game progresses, which is
what makes the cached-geometry design in §5 possible. Nothing that the legacy
table conceals is revealed: legacy hides the row, M3 hides the row's contents.

Seven states, each with a **word and a glyph** in the markup, never colour
alone: `Ready to research ▶`, `Not enough science ✕`, `In progress ↻`,
`Researched ✓`, `Fully researched ✦`, `Undiscovered · next ◈`, `Undiscovered ◇`.

## 3. Layout algorithm

Deterministic layered layout. No physics, no force simulation, no animation
loop, no external library.

1. **Column = topological depth** (longest path from a root), so progression
   always flows **left → right** and a column means "how deep in the tree".
2. **Row = tidy-tree placement inside a lane band.** Within a lane, nodes with
   no prerequisite *in that lane* start a strand; the first child continues on
   its parent's row (so a chain like Batteries T1→T4 reads as one straight
   horizontal run) and later siblings fan downwards. A subtree therefore
   occupies a contiguous block of rows, which is what stops branches from
   interleaving. An `occupied` map makes a cell collision impossible even for
   shapes this heuristic has not anticipated.
3. **Bands are separated by a fixed 46 px**, not by a blank grid row (which
   would have cost ~170 px five times over).
4. **Geometry is computed from grid indices and fixed cell constants** — never
   from DOM measurement. Identical in the browser and under test, free to
   recompute, and independent of viewport size.

Result for the shipped data: 7 columns × 13 rows, 1920 × 2568 px canvas, zero
cell collisions, and only **3 cross-lane edges**.

### Lanes (presentation-only)

| Lane | Contents |
| --- | --- |
| Industry & Extraction | Storage, Oil, Basic Energy, Solar, Machines, Destruction, Engine/Resource upgrades |
| Power & Storage | Solar upgrade, Batteries T1–T4 |
| Space Programme | Space, Oxidisation, Hydrazine |
| Scientific Method | Science T2–T4 |
| Sol Center | Plasma, PSU, EMC, Meteorite, Dyson |
| Standing programmes | The four standalone efficiency upgrades (see below) |

Lanes are a **visual grouping only**. Nothing in the game reads them; no cost,
effect, prerequisite or unlock is derived from one; a technology with no mapping
falls back to a lane rather than disappearing. Lane order was chosen so the
three cross-lane edges stay short: Industry → Power and Space → Science are
adjacent bands, Industry → Space skips one.

### The standing-programmes band

`efficiencyResearch`, `scienceEfficiencyResearch`, `energyEfficiencyResearch`
and `batteryEfficiencyResearch` have neither a prerequisite nor a successor.
Left in their thematic lanes each one consumed an entire grid row to display a
single card at column 0 — four near-empty rows out of sixteen, which is what
made early drafts of the map read as mostly emptiness. They are collected into
one band at the foot of the map and packed side by side (`node.packed === true`,
and `node.lane` is rewritten to `standalone` so a card can never be labelled
with a band it is not in).

**The trade-off, stated plainly:** inside this band the horizontal position is
packing order, not topological stage. Every node in it has `depth === 0` by
definition, so no stage information is lost — there is simply nothing for a
column to encode. This is the only place in the map where column ≠ stage, it is
asserted by `test/techGraph.test.mjs`, and the band carries its own title.

### Connectors

SVG paths in a single `<svg>` behind the nodes (`z-index: 0`,
`pointer-events: none`, `aria-hidden="true"`), so they can never intercept a
click or reach assistive technology. Each edge is an orthogonal elbow: out of
the parent's right edge, along a vertical channel **inside the column gutter**
(never over a node), then into the child's left edge, ending in a small solid
arrowhead that states the direction explicitly. Two long edges leaving the same
column would otherwise sit exactly on top of each other, so the channel is
offset by a deterministic function of the two endpoints' rows.

Connector styling encodes progress: a satisfied prerequisite draws a solid,
energised line; a discovered-but-unbought one draws dashed; an undiscovered one
draws faint. The selected node's edges are highlighted.

## 4. Node and inspector anatomy

**Node** (216 × 150 px, one `<article>`, two sibling `<button>`s — never nested):

- state badge (glyph + word);
- name, clamped to two lines;
- type chip — `Unlock` / `Upgrade` / `Levelled upgrade` / `Repeatable` — plus
  `Level n` or `Level n / m` where applicable;
- bottom line: the **cost** while the technology is still buyable, and its
  **headline effect** once it is not, so completed research stays legible as a
  record of what it bought instead of showing a dead "N/A";
- a `Research` button, present only when the technology is canonically
  actionable, disabled (and labelled "Need more science") when unaffordable.

**Inspector** (`#scTechPanel`): full name, canonical description, formatted
cost, science held, shortfall, level / repeatable status, prerequisites with
their real state, factual effect chips, the external-unlock provenance note
where one applies, and the canonical research button. With nothing selected the
panel becomes the **frontier readout** — affordable technologies, cheapest
first — so the column earns its space instead of showing one line of grey text.

Effect chips are derived, never invented: tab openings come from `newTabs`,
counts from `newResources` / `newTechs`, "Applies a permanent production
upgrade" from the presence of `onApply`, and level limits from `maxLevel`. The
prose explanation is the canonical `desc`.

## 5. Update cadence and performance

The DOM is built **exactly once**. Node geometry depends only on the static
`techData` shape, so progress never moves a node — which means a "rebuild" is a
diffed text/class refresh, never element creation. Nothing is ever appended,
removed or re-bound after the first build.

Registered as a single component in `Game.uiComponents` (the existing 100 ms UI
Update interval). No second loop, no per-node timer, no `MutationObserver`, no
`requestAnimationFrame`. Each tick:

1. compare `structureSignature()` — a string of `id:unlocked:current` — against
   the last one;
2. if it moved (an unlock, a purchase, a level), re-project and re-render;
3. otherwise run an affordability-only pass, which exits immediately when
   `science` has not changed.

Responsive mode uses one `matchMedia` listener, not a resize handler, so there
is nothing to debounce. Connector geometry never needs recomputing because it
does not depend on the viewport.

Measured in Chrome at 1440×900 on a mid-game save:

| Measurement | Result |
| --- | --- |
| Graph construction (`build()`, incl. layout + connectors) | **0.85 ms** |
| Structure signature | **0.007 ms** |
| Steady per-tick update | **0.0055 ms** |
| Purchase → rendered | **0.10 ms** |
| Elements after 10 re-initialisations | 21 182 → **21 182** |
| Elements after 20 tab round-trips | 21 182 → **21 182** |
| Nodes / connectors / buttons, always | 33 / 23 / 33 |

## 6. Accessibility

- Selectable and actionable nodes are native `<button>`s — never nested, never
  given a `role` that fights their semantics.
- Keyboard traversal is the natural tab order through visible technologies, in
  stage-by-stage reading order; Enter/Space activate natively.
- Concealed nodes are `tabindex="-1"` and `aria-hidden="true"`: they offer no
  action, so they are not controls, and they stay concealed in the a11y tree.
- Selection is `aria-pressed` on the select button (a standard toggle) plus a
  visible ring that does not depend on the focus ring.
- Every state is announced as text (`aria-label` carries name, type, state,
  level and cost); the research button says what it will do and what it costs.
- The progression meter is `role="img"` with a full-sentence label; the legend
  is a real toggle with `aria-expanded` / `aria-controls`.
- Connectors are decorative (`aria-hidden`, `pointer-events: none`).
- No live region: science changes every tick and must never be announced. The
  purchase result continues through the existing PNotify path.
- All controls are ≥ 44 px in pathway mode; nothing depends on hover.
- `Focus frontier` is a button, so pan is reachable without pointer gestures.
- `prefers-reduced-motion` disables the scroll animation and the transitions.

## 7. Responsive behaviour

| Width | Mode | Why |
| --- | --- | --- |
| ≥ 901 px | **Map** | The 1920 px canvas pans inside `#scTechViewport`; the page never scrolls sideways. |
| ≤ 900 px | **Pathway** | A 1920 px map shrunk to phone width is unreadable, so the same nodes become a vertical progression grouped by stage, with a simplified spine connector and full-width cards. |

One DOM serves both. Nodes live inside `<section class="sc-tech__stage">`
wrappers which are `display: contents` in map mode (so absolute positioning
works against the canvas while the DOM keeps a sane stage-by-stage reading
order) and ordinary blocks in pathway mode. Geometry is applied via classes
that only map mode references, so pathway mode simply ignores it.

**Tablets were decided on evidence, not a guess.** 1024×768 keeps the map: ~4.5
stages are visible and panning is comfortable. 768×1024 switches to the pathway:
at 768 px the map shows barely two stages and reading it means panning in both
axes. Both are captured in the acceptance evidence.

In pathway mode the automatic frontier focus is suppressed — it scrolls the
*page*, and doing that unprompted drops the player into the middle of the list
with the header off screen. The explicit `Focus frontier` button still works.

## 8. Fallbacks

| URL | Result |
| --- | --- |
| default | Modern shell, modern resource dashboard, technology map. |
| `?research=legacy` | Modern M1/M2 shell, **original `#techTable`** restored, no map, no duplicated purchase controls. |
| `?ui=legacy` | Full legacy presentation, including the original research table. |

Both are resolved from the URL by an inline `<head>` script (before stylesheets,
so there is no flash) and **write nothing** — no save, no preference key, no
storage of any kind. M3 adds no persistent research-view setting.

## 9. Limitations, deferred

- **Horizontal panning is required at 1440 px.** Seven stages of 216 px cards
  cannot fit 1290 px of workspace without shrinking the cards past legibility
  (a 196 px variant was built and reverted — it clipped). A zoom-out control is
  the natural M5 answer.
- **No cross-lane edge-crossing minimisation.** With three cross-lane edges and
  a single-parent forest it is not yet worth the complexity; a real Sugiyama
  ordering pass would be needed if the data ever gains multi-parent nodes.
- **The frontier readout lists at most six technologies** and is text only;
  making its entries selectable is M4/M5 polish.
- **Lane assignment is hand-maintained** for 33 ids. A new technology without a
  mapping falls back to a lane and still lays out, but will not be themed until
  someone adds it. This is a deliberate cost of keeping taxonomy out of the
  gameplay data.
- **Pathway mode does not collapse completed stages.** Collapsing was ruled out
  because every candidate design lost information the player had earned.
- **Live-region announcements** for "a new technology became affordable" are
  deferred to M5 alongside M2's storage/energy announcements.
