# Accessibility

Referenced by `ui/modern/uiRuntime.js` and by the font comment in `index.html`.

**M5a is not the completed accessibility milestone.** It delivers a *foundation*:
the shared preference namespace, one motion decision, one live-region
coordinator, and the contrast corrections that fell out of the performance
work. The keyboard, WCAG-audit, notification and viewport-control work is
deliberately deferred to M5b–M5d and is listed as outstanding below.

Nothing in this document is a claim of WCAG conformance or certification. The
measurements here are point checks against specific success criteria, not an
audit. See [M5A_PERFORMANCE_FOUNDATION.md](M5A_PERFORMANCE_FOUNDATION.md) for
the performance work this milestone was actually scoped around.

## What exists today

### Semantics and focus (M1–M4)

The modern surfaces annotate their own controls; the counts below are of
occurrences in `ui/modern/*.js`, not a coverage claim.

| Attribute | Uses | Where |
| --- | --- | --- |
| `aria-hidden` | 24 | decorative glyphs, connector canvases, duplicated text |
| `aria-label` | 10 | icon-only controls that have no visible text |
| `aria-pressed` | 9 | M2 resource cards mirror the legacy row's selected state |
| `aria-expanded` | 4 | legend and panel disclosure toggles |
| `aria-controls` / `aria-labelledby` | 2 / 2 | disclosure and panel relationships |
| `aria-valuenow` / `min` / `max` | 2 / 1 / 1 | the M3 progress meter (`role="progressbar"`) |
| `aria-disabled` | 2 | unaffordable actions that stay focusable |
| `role` | 5 | `group` ×3, `progressbar`, `img` |

Focus is visible rather than suppressed: M3 (`styles/modern/research.css`) and
M4 (`styles/modern/celestial.css`) pair `outline: none` with
`box-shadow: var(--sc-focus-ring)` on `:focus-visible`, so keyboard focus stays
obvious while pointer clicks do not draw a ring.

M5a added the one shared `.sc-visually-hidden` utility
(`styles/modern/base.css`) used by the live regions and by any control needing
an accessible name without visible text.

### The `sc.ui.*` preference foundation

Presentation-only preferences in `localStorage`, defined in
`ui/modern/uiRuntime.js`:

| Key | Default | Values |
| --- | --- | --- |
| `sc.ui.motion` | `system` | `system` \| `full` \| `reduced` |
| `sc.ui.announcements` | `normal` | `normal` \| `reduced` \| `off` |
| `sc.ui.audioEnabled` | `false` | boolean |
| `sc.ui.audioVolume` | `0.4` | 0–1, clamped |
| `sc.ui.resourceDensity` | (M2) | resource-card density |

Guarantees, each covered by `test/uiRuntime.test.mjs`:

- nothing is written until a preference is actually changed;
- any unexpected or corrupt value falls back to the default;
- `resetPreferences()` removes **only** `sc.ui.*` keys and never
  `localStorage["save"]`;
- preferences never enter the save or the LZString export.

### Motion

`prefersReducedMotion()` is the single decision point: the OS
`(prefers-reduced-motion: reduce)` query is the default, and `sc.ui.motion` only
overrides it locally. The result is published as `data-motion` on `<html>` so
CSS never re-derives it.

Under `data-motion="reduced"`, animations and transitions collapse to 1 ms and
`scroll-behavior` becomes `auto`. The loader is a deliberate exception: the
spinner stops but the splash text remains, so the screen never looks frozen.

### Live-region coordinator

Two regions are created once, both `.sc-visually-hidden` and `aria-atomic`:

- `#sc-a11y-live` — `role="status"`, `aria-live="polite"`;
- `#sc-a11y-alert` — `role="alert"`, `aria-live="assertive"`.

Behaviour:

- **Hydration silence** — nothing is announced until ~1.5 s after
  initialisation, so loading a save never reads out dozens of "changes" that
  are really just hydration;
- **Deduplication** — a message identical to the last one, or already queued in
  the current burst, is dropped;
- **Coalescing** — a burst is flushed as one sentence joined with `. `;
- **Rate limiting** — a minimum 900 ms between polite flushes;
- **Respects preference** — `reduced` drops routine news but keeps assertive
  messages; `off` silences everything, including assertive.

Writes go through a managed text node rather than `textContent =`, which is the
cheapest possible update and behaves identically under the test DOM.

> **The announcer is dormant.** No gameplay event is wired to it in M5a. The
> only callers are `test/uiRuntime.test.mjs`. It is a coordinator waiting for
> M5b to decide *what* is worth announcing — it is not a delivered screen-reader
> feature, and must not be described as one.

### Audio

`sc.ui.audioEnabled` and `sc.ui.audioVolume` exist as preference keys only.
**There is no audio implementation anywhere in the modern UI**, nothing ever
plays, and the default is off. The keys reserve the contract so that M5d does
not have to migrate preferences later.

### Contrast

M5a corrected two contrast defects found during the performance work:

- selected legacy rows (`.info`) under the modern shell measured **1.03:1** —
  Bootstrap paints the cell a light-theme blue while modern body text is
  near-white. The correction is general, scoped to
  `html[data-ui="modern"]`, and keeps semantic red/green values visible. It is
  locked by `test/selectedRowContrast.test.mjs`.
- `--sc-text-muted` moved from `#6d7f97` to `#7385a0`, taking muted card
  telemetry from 4.46:1 to 4.86:1 on the card surface.

Selection is never signalled by colour alone: the selected row also carries a
solid leading edge.

### Network and fonts

The Orbitron webfont request to `fonts.googleapis.com` was removed in M5a; the
display face resolves from a documented local/system stack in
`styles/modern/tokens.css`. The game makes **no third-party runtime request**.
See [PRIVACY.md](PRIVACY.md).

## Known limitations

### Inherited `?ui=legacy`

`?ui=legacy` intentionally preserves the original Bootstrap presentation
byte-for-byte. It therefore does **not** receive any of the above: no modern
focus ring, no `data-motion` handling, no contrast corrections, and the
selected-row `.info` styling remains the inherited light-theme blue. This is
deliberate — the fallback exists to be unchanged — and it is not a defect to be
"fixed" there.

The same applies to the component fallbacks (`?resources=legacy`,
`?research=legacy`, `?space=legacy`) for whichever pane they revert.

### Not yet done

- No keyboard navigation model for the M3 graph or the M4 map beyond native tab
  order; no roving tabindex, no arrow-key traversal, no skip links.
- No systematic WCAG audit. Contrast has been checked at specific points; other
  criteria (focus order, name/role/value coverage, target size, motion
  alternatives) have not been assessed.
- No accessible notification/toast handling; PNotify remains inherited and
  unreviewed.
- No settings UI for `sc.ui.*` — every preference must currently be set
  programmatically.
- No viewport or zoom controls.
- Announcer not wired to any gameplay event.
- Audio unimplemented.

## Planned follow-up

| Milestone | Scope |
| --- | --- |
| **M5b** | Keyboard model for the graph and map; focus order and skip links; wire the announcer to a small, deliberately chosen set of gameplay events. |
| **M5c** | Systematic WCAG pass; notification/toast accessibility; settings UI exposing `sc.ui.*`. |
| **M5d** | Optional audio cues honouring `audioEnabled`/`audioVolume`; viewport and zoom controls; motion alternatives for remaining decorative effects. |

None of this has begun.
