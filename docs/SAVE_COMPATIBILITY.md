# Save Compatibility

Existing browser saves and exported save strings are **valuable user data**.
This document is the contract for keeping them working. Every invariant here is
covered by a characterization test in [`test/`](../test/) so regressions fail
loudly.

## Storage key

- **`localStorage["save"]`** — the one and only key the game reads/writes for a
  saved game. Stored as **plain `JSON.stringify(data)` text** (see `game.js:150`),
  **not** compressed.
- There is no versioned or namespaced key. A single slot per browser origin.

### Non-save keys (presentation preferences)

First-party modern UI code may store **presentation preferences** under the
`sc.ui.*` namespace. These are not game state, are never merged into the save
object, and their loss only resets a display choice:

| Key | Written by | Meaning |
| --- | --- | --- |
| `sc.ui.resourceDensity` | `ui/modern/resourceDashboard.js` (M2) | `comfortable` \| `compact` — resource-card density. |

M3 adds **no key at all**: `ui/modern/techGraph.js` and
`ui/modern/techCommandCenter.js` never touch `localStorage` or `sessionStorage`,
and the selected technology is module state that dies with the page. The
research view mode is resolved from the URL on every load
(`?research=legacy`, `?ui=legacy`) and is never persisted. Enforced by
`test/researchCommandCenter.test.mjs`.

Rules: modern UI modules must **never** read or write `localStorage["save"]`,
and must tolerate storage being unavailable (private mode) without breaking.
Enforced by `test/resourceDashboard.test.mjs`, `test/uiModeSwitch.test.mjs` and
`test/researchCommandCenter.test.mjs`.

## Save object structure

`Game.save()` (`game.js:133`) builds one flat-ish object from two sources:

1. **Subsystem contributions** — each module writes its own keys:
   `Game.achievements.save`, `.statistics.save`, `.resources.save`,
   `.buildings.save`, `.tech.save`, `.settings.save`, `.interstellar.save`,
   `.stargaze.save`, `.updates.save`. These add nested structures such as
   `data.updates = { versionNumber: 1, entries: {…} }`.
2. **Legacy globals** — `legacySave(data)` (`saving.js`) merges ~180 top-level
   globals from `variable.js` via `$.extend({…defaults}, data)`. Note the merge
   order: **existing `data` values win** over the freshly-read globals for any
   overlapping key.

Always present at the top level (representative, load-bearing subset):

```
lastFixedUpdate   versionNumber   companyName
energy metal gem wood charcoal silicon uranium lava oil science
lunarite methane titanium gold silver hydrogen helium ice meteorite
plasma antimatter rocket rocketFuel
<resource>Storage / <resource>NextStorage        (storage caps)
<producer> counts (solarPanel, charcoalEngine, battery, miner, lab, …)
researched[] available[] explored[] tabsUnlocked[] resourcesUnlocked[]
activated[] buttonsHidden[] noBorder[]
researchUnlocked techUnlocked meteoriteUnlocked rocketLaunched (flags)
```

`lastFixedUpdate` (epoch ms) anchors **offline-progress** calculations on load.

### Technology state

`Game.tech.save` writes `data.tech = { v: 2, i: { <techId>: { current, unlocked } } }`
and `Game.tech.load` branches on `v` (`loadV1` migrates pre-v2 saves by reading
the vestigial `researched` / `available` arrays). M3 changes none of this: the
technology map reads `Game.tech.entries` and writes nothing, so a save produced
before M3 and a save produced after it are identical for the same progress.

## Import / export pipeline

Export (`Game.export`, `game.js:122`):

```
save object → JSON.stringify → LZString.compressToBase64 → textarea (#impexpField)
```

Import (`Game.import`, `game.js:101`) — validation happens **before** any write:

1. Reject if the field is empty / whitespace (`!text.trim()`).
2. Reject if `text.length % 4 !== 0` (base64 length guard).
3. `LZString.decompressFromBase64(text)`; reject if the result is falsy
   (undecompressable garbage).
4. Only if all pass: `localStorage["save"] = decompressed`, then reload.

Because a real export is always valid base64, its length is always a multiple of
4 and it always decompresses — so exports round-trip cleanly. These rules are
locked by `test/importExport.test.mjs`.

## Compatibility invariants (must not change without a migration)

1. **Storage key stays `"save"`** and stays **plain JSON** (uncompressed) in
   `localStorage`.
2. **Export/import stays** `JSON → LZString.compressToBase64` (base64), and the
   three import-rejection rules above are preserved.
3. **`legacyLoad` tolerance:** missing keys keep their in-memory defaults;
   unknown keys are ignored; `null`/`undefined`/`{}` do not throw
   (`saving.js:201`). New save fields must be additive and optional.
4. **Backward-compatibility aliases are preserved.** The engine already maps the
   old name `spaceMetal*` onto `lunarite*`:
   `spaceMetal→lunarite`, `spaceMetalStorage→lunariteStorage`,
   `spaceMetalNextStorage→lunariteNextStorage`, `spaceMetalDrill→lunariteDrill`
   (`saving.js:276-281, 321`). Old saves that predate the Lunarite rename must
   keep loading.
5. **Key names and semantics are stable.** Renaming a persisted global without an
   alias silently drops player progress for that field.
6. **`lastFixedUpdate` semantics** (epoch ms of the last fixed tick) must stay
   intact for offline gains to be correct.
7. **Offline gain guard:** `handleOfflineGains` is a no-op for non-positive
   elapsed time (protects against clock skew / negative durations).

## Migration policy (for M1+)

- **Never mutate the save schema in place.** If a field must change, add a new
  field and read both; keep an alias for the old one (as `spaceMetal` does).
- **Detect version on load.** A `versionNumber` (and `updates.versionNumber`)
  already exists; future migrations should branch on it and upgrade forward
  only, never rewrite older saves destructively.
- **Migrations must be pure and testable** — add a fixture of the old save and a
  test asserting the upgraded result, alongside the existing round-trip tests.
- **Default any newly introduced field** so that pre-migration saves (which lack
  it) load unchanged.

## Recovery & rollback expectations

- **Export before you experiment.** The export string is a complete, portable
  backup; users should export before importing or updating.
- **`gh-pages` remains the deployable legacy branch** and a rollback target: a
  save produced by the live legacy game must continue to load there unchanged.
- **Reset is guarded:** `deleteSave()` only clears storage when the user types
  the exact word `DELETE`; nothing else wipes the save.
- **No destructive auto-migration in M0.** Loading an old save in this fork
  produces the same in-memory state as the legacy game — verified by the save
  round-trip and import/export tests.
