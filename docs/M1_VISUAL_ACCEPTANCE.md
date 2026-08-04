# M1 — Visual Acceptance

Premium sci-fi design system & command-center shell, applied non-destructively
over the legacy game. This records what was verified and what was deliberately
deferred.

## What M1 delivered

- A real **design-token system** (`styles/modern/tokens.css`): semantic colour,
  typography, spacing (4/8px), radius, elevation, motion, and layout tokens.
- A **deep-space canvas** built from pure CSS gradients + a code-native star
  field and faint technical grid (no raster download, no `<canvas>` loop).
- A **cinematic loading screen**: glowing Orbitron wordmark, cyan-glow planet,
  and a dual counter-rotating cyan/amber reactor loader ring — reusing the
  legacy `#loadScreen`/`#loadLogo`/`#splashText` and their hide contract.
- A **command-center shell**: instrumentation header (identity, version chip,
  energy-deficit alert pill, autosave telemetry), a command-strip primary nav
  (scrollable on mobile), and a layered glass workspace.
- A **legacy component compatibility layer** (buttons, tables, panels, forms,
  dropdowns, alerts, modals, tooltips, progress bars, PNotify) skinned to the
  system, plus reusable status states.
- **Privacy cleanup**: Google Analytics and the Kongregate API script removed
  (see [PRIVACY.md](PRIVACY.md)).
- A **diagnostic legacy fallback** via `?ui=legacy`.

Everything is scoped to `html[data-ui="modern"]`; the game's DOM contract is
untouched (see [UI_DOM_CONTRACT.md](UI_DOM_CONTRACT.md)).

## Tested viewports

Real-browser QA (Chrome automation) plus computed-style checks. Note the test
environment's physical window is clamped (min ≈ 500px wide, max ≈ 1366px wide),
so the extreme desktop/mobile widths were validated via the responsive CSS +
structural checks rather than a pixel-exact window.

| Target | How verified | Result |
| --- | --- | --- |
| 1440×900 | CSS (`--sc-content-max`, ≤1024 rules); window capped at 1366 | Layout constrained, centered, no overflow |
| 1366×820 | Live browser | ✅ Shell renders; no horizontal overflow (scrollWidth == innerWidth) |
| 1024×768 | `@media (max-width:1024px)` | ✅ Padding/width compaction |
| 768×1024 | `@media (max-width:768px)` | ✅ Header wraps, nav compresses |
| 390×844 / 360×800 | `@media (max-width:480/360px)`; window floored ≈500 (≈476 effective) | ✅ Full-width cards, scrollable nav strip, no overflow |

## Functional QA (live browser)

- ✅ Loading screen transitions away via the existing runtime path
  (`#loadScreen` → `className="hidden"`); modern loader renders meanwhile.
- ✅ Game UI becomes visible; resources render.
- ✅ **No fatal console errors** at any viewport.
- ✅ **No failed first-party asset requests** (all modern CSS/JS + icons = HTTP 200).
- ✅ **No request to Google Analytics or Kongregate** (network audit).
- ✅ Primary navigation works — switching to More/Research; only one pane visible
  at a time (`visiblePanes: ['more']`) — no locked-content exposure.
- ✅ Resources, Help/FAQ, More reachable.
- ✅ Locked tab (`researchTab`) stays `display:none`; unlock reveals it and shows
  the amber notification glyph.
- ✅ Safe interaction (tab switch) works.
- ✅ Save + reload retains a sentinel company name (real `Game.save()` → reload →
  `legacyLoad`), plain-JSON `localStorage["save"]` unchanged in shape.
- ✅ `?ui=legacy` loads the original Bootstrap presentation (white canvas,
  original loader) and remains functional.
- ✅ No page-level horizontal overflow at any tested width.

## Visual acceptance checklist (blockers — all clear)

- ✅ Does **not** resemble stock Bootstrap (dark command center, cyan/amber system).
- ✅ No text overlap/clipping observed.
- ✅ Resource numbers are prominent (tabular mono, colour-coded).
- ✅ Modern CSS does **not** expose locked tabs (`.hidden` never overridden;
  enforced by tests).
- ✅ Mobile navigation usable (scrollable command strip, ≥44px targets, no
  hover-only menus).
- ✅ Background never reduces text contrast (vignette + fixed layers behind
  content, WCAG-minded token contrast).
- ✅ Focus indicators visible (cyan focus ring on interactive elements).
- ✅ Consistent radii/spacing (token-driven).
- ✅ Legacy and modern styles do not visibly fight (modern layer scoped + higher
  specificity).
- ✅ Not a mere recolour — new layout system, canvas, loader, nav, workspace.
- ✅ No console errors / broken asset requests.
- ✅ Loading screen transitions reliably.
- ✅ Save/reload behaviour unchanged.

## Modern / legacy fallback

- **Default:** modern shell (`<html data-ui="modern">`, confirmed FOUC-safe via
  an inline head script that resolves the mode before stylesheets load).
- **Escape hatch:** `?ui=legacy` → `data-ui="legacy"`; modern rules are all
  scoped to `[data-ui="modern"]`, so legacy mode renders the original Bootstrap
  presentation. Both modes share identical gameplay state.
- **Not persisted:** the mode is read from the URL each load and never written to
  the save (enforced by `test/uiModeSwitch.test.mjs`).
- **Limitation:** legacy mode is a *functional* fallback — the original markup
  and behaviour are intact, but a few structural niceties added for the shell
  (e.g. the decorative loader-ring element, `aria-label` on the nav) are present
  in the DOM though unstyled/inert in legacy mode. No legacy behaviour is
  altered.

## Screenshots (in `docs/screenshots/`)

| File | Description |
| --- | --- |
| `before-desktop.jpg` | Legacy Bootstrap desktop (before). |
| `before-mobile.jpg` | Legacy Bootstrap mobile (before). |
| `after-desktop.jpg` | Modern command center, default state (after). |
| `after-desktop-progressed.jpg` | Modern shell with a synthetic progressed state (unlocked Research tab, dense values). |
| `after-mobile.jpg` | Modern shell on mobile width. |

The modern loading screen (dual cyan/amber reactor ring) was verified live during
QA; a still was not committed because the load completes too quickly to reliably
capture in the automation environment. It is reproducible locally by throttling
the tab or reloading.

Progressed/denser states were produced with a **synthetic** in-memory state via
the game's own unlock/refresh functions — never a real player's save.

## Known limitations (intentionally deferred)

- **M2:** the resource list is only lightly restyled; the true responsive
  resource-card dashboard (and wrapping/replacing `#resourceNavParent`) is M2.
- **M3:** research/progression visualization.
- **M4:** interactive solar-system / interstellar experience.
- **M5:** deeper accessibility passes (full ARIA/live-region audit, audio),
  motion polish.
- **Fonts:** Orbitron still loads from Google Fonts (graceful fallback); optional
  self-hosting deferred (see PRIVACY.md).
- **Test-environment viewport clamp:** true 1440-wide and sub-500 mobile widths
  couldn't be physically realized in the automation window; validated via CSS +
  structural tests.

## Privacy / network findings

Google Analytics and the Kongregate API script removed; only Google Fonts
(Orbitron) remains as an external call, with a system fallback. Full details and
evidence in [PRIVACY.md](PRIVACY.md).
