# Legacy Architecture

A factual map of how the inherited Space Company game is wired, produced during
the M0 forensics pass. This describes the code **as it is today**; it does not
propose changes.

Baseline commit: `da4881e465a3a713ff0ccf26efc7c30aad905a87`
Runtime version string: `V0.5.1.2 Beta` (from `variable.js`).
`package.json` version: `0.4.3` (stale relative to the runtime string — noted, not changed).

## Stack

- Static site: a single large `index.html` (~7,200 lines) plus CSS and global JS.
- Vendored libraries in `lib/`: jQuery, Bootstrap, Handlebars, PNotify, and
  **lz-string** (save compression). Bootstrap "swatch" themes live in `styles/`.
- No module system, no bundler in the runtime path. Everything is browser
  globals shared across `<script>` tags.

## Runtime entrypoints

1. The browser parses `index.html`.
2. `<head>` loads Google Analytics, the Kongregate API, the Orbitron web font,
   and `data/splashTextData.js`.
3. Near the end of `<body>`, scripts load in a fixed order (see below).
4. `window.onload` → `Game.start()` (`game.js:410`).
5. `Game.start()` schedules a "Loading" interval; `Game.loadDelay()`
   (`game.js:229`) initialises subsystems, loads the save, starts the loops,
   and hides the load screen.

## Script loading order (authoritative)

The game runs from **individual `<script>` tags**, not a bundle. The single-file
`<script src="SpaceCompany.min.js">` line in `index.html` is **commented out**.
The order the browser actually loads (excluding vendored `lib/*`) is:

```
data/splashTextData.js        (in <head>)
variable.js  game.js  utils.js  updates.js  achievements.js
data/achievementsData.js  constants.js  statistics.js  resource.js
data/resourceData.js  building.js  data/buildingData.js  tech.js
data/techData.js  data/interstellarData.js  data/starData.js  settings.js
interstellar.js  star.js  rocketParts.js  rocket.js  stargaze.js
data/stargazeData.js  ui/databoundElement.js  ui/gameTabUI.js
ui/resourceObserver.js  ui/interstellarUI.js  ui/achievementUI.js
ui/statisticUI.js  ui/stargazeUI.js  ui/resourceUI.js  ui/techUI.js
ui/legacyUI.js  core.js  notification.js  saving.js  resources.js
science.js  solarSystem.js  wonder.js  solCenter.js
```

`scripts/build.mjs` derives this exact list from `index.html` at build time so
the generated bundle can never drift from the live load order.

## Major modules

| File(s) | Responsibility |
| --- | --- |
| `variable.js` | ~180 top-level global `var`s: all resource amounts, storages, machine counts, costs, and unlock flags. The mutable heart of the game. |
| `constants.js` | Enums (`RESOURCE`, `TECH_TYPE`, …) and `Game.constants`. |
| `game.js` | The `Game` object: main loop, interval scheduler, save/load/import/export, offline gains, reset, notifications. |
| `utils.js` | `Game.utils`: number/time formatting, prototype extensions (`String.format`, `Number.clamp`). Mostly pure. |
| `core.js` | Production math: `gainResources`, `refreshPerSec`, storage rounding, EMC, cost checks, UI refresh glue. |
| `resource.js` + `data/resourceData.js` | `Game.resources`: data-driven resource registry, `addResource`/`takeResource`/`maxResource`, storage upgrades, machine buy/destroy. |
| `building.js` + `data/buildingData.js` | `Game.buildings`: producer definitions. |
| `tech.js` / `science.js` + `data/techData.js` | `Game.tech` research and science. |
| `interstellar.js`, `star.js`, `stargaze.js`, `solarSystem.js`, `solCenter.js`, `wonder.js`, `rocket.js`, `rocketParts.js` | Mid/late-game progression systems. |
| `achievements.js`, `statistics.js`, `settings.js`, `updates.js`, `notification.js` | Supporting subsystems, each with `save`/`load`/`initialise`. |
| `saving.js` | `legacySave`/`legacyLoad`: snapshot & restore of the `variable.js` globals (see SAVE_COMPATIBILITY.md). |
| `ui/*.js` | View layer: data-bound elements, tab UI, per-system UI. `ui/legacyUI.js` is the large legacy view glue. |

## State ownership

State lives in **two** places:

1. **Global `var`s** declared in `variable.js` (and a few elsewhere, e.g.
   `versionNumber`, `companyName`). These are read/written directly across files
   and are snapshotted by `legacySave`.
2. **Module objects** (`Game.resources`, `Game.buildings`, `Game.tech`,
   `Game.achievements`, `Game.statistics`, `Game.settings`, `Game.interstellar`,
   `Game.stargaze`, `Game.updates`), each exposing its own `save(data)` /
   `load(data)` that write into / read from the shared save object.

`Game.save()` (`game.js:133`) calls every module's `save(data)` and then
`legacySave(data)` to fold in the globals.

## Game loop

Two cooperating clocks (`game.js`):

- **`requestAnimationFrame` loop** (`update_frame` → `update`, `game.js:15`):
  drives a set of named intervals via `Game.createInterval(name, cb, delayMs)`.
  Registered intervals: `Fast Update` (100 ms), `Slow Update` (1000 ms),
  `UI Update` (100 ms), plus loading/animation intervals.
- **`setInterval(fixedUpdate, 100)`** (`game.js:266`): a 10 Hz fixed tick that
  runs even when the tab is inactive. `fixedUpdate` computes real elapsed time
  and calls `refreshPerSec` → `gainResources` → `fixStorageRounding`. This is
  the authoritative production tick (the changelog notes framerate was reduced
  from 100 fps to 10 fps).

## Persistence flow

- **Storage key:** `localStorage["save"]`, stored as **plain `JSON.stringify`
  text** (not compressed).
- **Autosave:** `updateAutoSave` (`game.js:368`) counts elapsed time against
  `Game.settings.entries.autoSaveInterval` and calls `Game.save()`.
- **Export:** `Game.export()` → `Game.save()` object → `JSON.stringify` →
  `LZString.compressToBase64` → textarea (`game.js:122`).
- **Import:** `Game.import()` (`game.js:101`) validates the textarea, then
  `LZString.decompressFromBase64` → writes `localStorage["save"]` → reloads.
- **Offline progress:** on load, `handleOfflineGains(elapsed)` (`game.js:203`)
  applies production for the wall-clock time since `data.lastFixedUpdate`.
- **Reset:** `deleteSave()` (`game.js:215`) requires the user to type `DELETE`.

Full detail in [SAVE_COMPATIBILITY.md](SAVE_COMPATIBILITY.md).

## UI coupling

The view is tightly coupled to the model: subsystem `update()` methods call UI
refresh functions directly (`legacyRefreshUI`, `refreshResources`, cost-colour
updates, etc.), and UI reads globals directly. jQuery selectors and Handlebars
templates render into the DOM defined in `index.html`. There is no separation
between simulation and rendering — a key target for later milestones.

## External dependencies (network)

Loaded/contacted at runtime:

- **Google Analytics** (`analytics.js`, `index.html:22-31`) — active telemetry.
- **Kongregate API** (`cdn1.kongregate.com`, `index.html:12`).
- **Google Fonts** (Orbitron).
- **oembed** metadata pointing at `sparticle999.github.io`.

The game degrades gracefully offline (these fail silently; fonts fall back).
None were added or removed in M0 — see RISK_REGISTER.md for the privacy note on
Google Analytics.

## Generated artifacts vs. source

- **Source:** all `*.js` at the repo root, plus `data/`, `ui/`.
- **Vendored (third-party, pre-minified):** `lib/*`, `styles/*`, `fonts/*`.
- **Generated:** `SpaceCompany.min.js` — produced by the build, git-ignored,
  and unused by `index.html`. Historically produced by Grunt.

## The legacy build (Grunt) — broken and unused

`Gruntfile.js` + `package.json` declared `grunt`, `grunt-contrib-concat`,
`grunt-contrib-uglify` (Grunt 0.4). It is **non-functional**:

- The `concat` source list references **`loading.js`, which does not exist** in
  the repo, so `grunt concat` fails outright.
- Its file list is stale (omits `building.js`, all of `data/` and `ui/`, etc.).
- Its output (`SpaceCompany.min.js`) is commented out of `index.html`, so even a
  successful build would not affect the running game.

M0 leaves `Gruntfile.js` byte-for-byte untouched (non-destructive) and supersedes
it with `scripts/build.mjs` (zero-dependency, deterministic). The obsolete Grunt
`devDependencies` were removed from `package.json` because they were never
installed (no lockfile existed) and the pipeline cannot run.
