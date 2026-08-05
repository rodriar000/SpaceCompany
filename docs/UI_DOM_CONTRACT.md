# UI DOM Contract

The legacy game logic (jQuery + Bootstrap + global functions) depends on a set
of element IDs, classes and ancestry. M1 restyles the interface **without
changing this contract**: the modern command-center shell is a CSS layer (plus a
tiny presentation-only `ui/modern/shell.js`) scoped to `html[data-ui="modern"]`.

M2 replaces the **presentation** of the resource list with a card dashboard,
still without changing this contract — the legacy rows remain in the document,
data-bound and authoritative (see "M2 resource dashboard" below).

This document records what must not change so future milestones (M3+) can
restructure safely.

## Golden rules

1. **Never override `.hidden`.** Bootstrap defines `.hidden { display:none !important }`
   and legacy code toggles it to lock tabs, resources, buttons and glyphs.
   Modern CSS must never set a non-`none` display on `.hidden`. (Enforced by
   `test/modernShell.test.mjs`.)
2. **Never force `display` on nav `<li>` items.** `#tabList` is a flex container;
   hidden `<li>` (via `.hidden` or inline `display:none`, e.g. `#machineTopTab`)
   are removed from flex layout automatically. Do not set `display` on the items.
3. **Do not touch Bootstrap tab mechanics.** `.tab-content > .tab-pane`,
   `.fade`, `.in`, `.active` control which pane shows. Style them, never change
   their display logic.
4. **Preserve the loading-screen hide contract.** `#loadScreen` is hidden by
   runtime code setting `className = "hidden"`. Modern CSS may restyle
   `#loadScreen` but must keep `#loadScreen.hidden { display:none }`.
5. **Presentation JS must not touch game state.** `ui/modern/shell.js` reads only
   the URL and sets `data-ui`; it never reads/writes `localStorage["save"]` or
   any gameplay global. (Enforced by `test/uiModeSwitch.test.mjs`.)

## Immutable legacy selectors (IDs relied on by runtime code)

| ID | Role |
| --- | --- |
| `loadScreen`, `loadLogo`, `splashText` | Loading screen; hidden via `className="hidden"`. |
| `game` | Root container; `class="container hidden"` → `container` on load. |
| `companyName` | Company name text (from save). |
| `versionLabel` | Version string (`Game.updateUI`). |
| `energyLow` | Energy-deficit warning (toggled `.hidden`). |
| `autoSaveTimer` | Autosave countdown text (`Game.updateAutoSave`). |
| `tabList` | `<ul>` of top-level tabs. |
| `tabContent` | `.tab-content` wrapper of panes. |
| `resourceNavParent` | Resource nav `<table>`. |
| `<resource>Nav` (`metalNav`, `energyNav`, …) | Resource rows; `onclick="activeResourceTab(...)"`; locked via `.hidden`. |
| `<resource>`, `<resource>ps`, `<resource>Storage`, `<resource>StorageBox` | Live value / per-second / storage spans (data-bound). |
| `<tab>Tab` / top tabs (`researchTab`, `solarSystemTab`, `wonderTab`, `solCenterTopTab`, `machineTopTab`) | Top-level tab `<li>`; unlocked by removing `.hidden` / setting display. |
| `<tab>Glyph` (`resourcesTabGlyph`, …) | Notification glyphs; shown/hidden via `.hidden`. |
| Tab panes: `resources`, `research`, `solarSystem`, `wonder`, `solCenterPage`, `machineTab`, `help`, `more` | `data-toggle="tab"` targets (`href="#..."`). |

Tab links use Bootstrap `data-toggle="tab"` + `onclick="tabClicked('...')"`.
Resource rows use `data-toggle="tab"` + `onclick="activeResourceTab('...')"`.

## Immutable legacy classes / behaviour

| Selector | Meaning — do not repurpose |
| --- | --- |
| `.hidden` | display:none (lock). **Never override.** |
| `.active` | Active tab / pane. |
| `.red` | Unaffordable / deficit cost (`color:red !important` in `style.css`). Restyled to a dark-legible red **plus** a weight cue; still means "can't afford". |
| `.green` | Affordable / positive. |
| `.bold` | Emphasis (bold + underline) — the non-colour cost cue. |
| `.sideTab`, `.earth` | Resource-row grouping (Earth vs space resources). |
| `.pointer`, `.no-select`, `.default`, `.disabled` | Interaction/utility from `style.css`. |
| `.glyphicon-*` | Bootstrap glyph icons (tab/notification markers). |
| `.ui-pnotify*` | PNotify notification containers. |

## Elements safe to STYLE (M1 does)

The `.navbar`, `#tabList.nav-tabs`, `#tabContent`, `.btn*`, `.table*`, `.panel`,
`.form-control`, `.dropdown-menu`, `.alert`, `.modal*`, `.tooltip*`,
`.progress*`, `.ui-pnotify*`, `#resourceNavParent` rows, and the loading screen
are restyled purely via CSS.

## M2 resource dashboard — how the list was replaced

M2 did **not** rewrite `#resourceNavParent`. The legacy table stays in the DOM,
keeps every ID, class, handler and data binding, and remains the authority for
lock state, selection and values. What changed is only what the player sees:

- `ui/modern/resourceDashboard.js` inserts `#scResourceDashboard` as the first
  child of the `#resources` pane and renders one card per `<res>Nav` row.
- `styles/modern/resources.css` hides the legacy column with
  `html[data-ui="modern"][data-resources="cards"] #scResourceDashboard ~ .container.col-xs-1 { display:none }`.
  The **sibling combinator is load-bearing**: the legacy list is only hidden
  while the dashboard actually exists, so a failed build degrades to the table.

Rules for anyone touching this area:

1. **Never invert the direction of truth.** The dashboard reads `.hidden` and
   `info` off the row; it must never write them. Unlocking stays the job of
   `refreshResources()`; selection stays the job of `activeResourceTab()`.
2. **Activate by delegation.** A card must dispatch a real `click()` on its
   `<tr>` so the inline handler *and* Bootstrap's `data-toggle="tab"` data-api
   both run. Do not reimplement either.
3. **Keep the row shape the projection reads**: `id="<res>Nav"`, an `<img>`, four
   `<td>`s (icon, name, `#<res>ps`, `#<res>`), the `onclick`/`data-toggle`
   attributes, and the `collapse*` header rows that seed the card groups.
   `test/m2ResourceView.test.mjs` fails if any of these regress.
4. **Do not reuse `.hidden` for modern state.** The dashboard mirrors it into its
   own `sc-is-locked`; groups collapse via `sc-is-empty`.
5. `#resourceTabParent` and its `.tab-pane` children may be restyled (width,
   float, margin) but their `display` logic is Bootstrap's — leave it alone.

## Elements safe to WRAP later (not done in M1/M2)

The header brand cluster can be wrapped in new layout containers provided the
inner IDs/handlers survive.

## Elements safe to REPLACE later (M3+)

- Research / solar-system / interstellar views → **M3/M4**.
- The resource **detail panel** internals (`#resourceTabParent` panes: gain
  buttons, machine tables, storage upgrades) — M2 only widened them.

## Known responsive hazards (legacy)

- `#resources > .container.col-xs-1` has a **fixed `width:380px`** inline. M1
  constrained it (`width:100%`) so it never forced page overflow; **M2 removes
  it from view entirely** in cards mode and gives the detail panel the reclaimed
  width. It still applies in either legacy fallback.
- Resource rows use fixed `height:60px` inline styles and 4-column tables — only
  visible now in `?ui=legacy` / `?resources=legacy`.
- The header is a `.navbar` with multiple `.navbar-brand` anchors and inline
  `height:50px`; M1 flexes it and lets it wrap on mobile.
- Several inline `style="..."` attributes exist; overriding them requires either
  higher specificity or targeted `!important` (used sparingly, never on `display`
  of `.hidden`).
- Wide legacy tables must scroll inside their own container
  (`overflow-x:auto`), never the page body.
