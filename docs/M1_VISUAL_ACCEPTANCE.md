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

## Tested viewports — EXACT (visual review pass)

Validated with **puppeteer-core driving the system Google Chrome** (headless,
`page.setViewport` sets the true CSS viewport). Each row's `innerWidth`/
`innerHeight` were read from the live page and match the requested size exactly —
no CSS inference, no clamped window. (An earlier pass used the extension's
`resize_window`, which clamps to the physical display ~500–1366px; that
limitation is now resolved. The QA harness lives in scratchpad and is not
committed / not in the dependency graph.)

| Requested | actual innerWxH | scrollWidth | H-overflow | mode | state | console | net | screenshot |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1440×900 | 1440×900 | 1440 | ✅ none | modern | fresh | 0 err | 0 fail / 0 tracker | review-modern-1440x900.jpg |
| 1440×900 | 1440×900 | 1440 | ✅ none | modern | progressed | 0 err | 0 / 0 | review-modern-progressed-1440x900.jpg |
| 1024×768 | 1024×768 | 1024 | ✅ none | modern | fresh | 0 err | 0 / 0 | review-modern-1024x768.jpg |
| 768×1024 | 768×1024 | 768 | ✅ none | modern | fresh | 0 err | 0 / 0 | review-modern-768x1024.jpg |
| 390×844 | 390×844 | 390 | ✅ none | modern | fresh | 0 err | 0 / 0 | review-modern-390x844.jpg |
| 360×800 | 360×800 | 360 | ✅ none | modern | fresh | 0 err | 0 / 0 | review-modern-360x800.jpg |
| 390×844 | 390×844 | 390 | ✅ none | modern | progressed | 0 err | 0 / 0 | review-modern-progressed-390x844.jpg |
| 1440×900 | 1440×900 | 1440 | ✅ none | legacy | fresh | 0 err | 0 / 0 | review-legacy-1440x900.jpg |
| 390×844 | 390×844 | 405 | ⚠ yes (inherited) | legacy | fresh | 0 err | 0 / 0 | review-legacy-390x844.jpg |

All **modern** viewports: exact size, **zero horizontal overflow**, loaded,
resources render, `#researchTab` `display:none` when fresh / `block` when
progressed, only one tab-pane visible, no console errors, no failed first-party
assets, no Google-Analytics/Kongregate requests. The single overflow is
**legacy `?ui=legacy` at 390px** — the original, non-mobile Bootstrap layout,
inherited behaviour (see Known limitations); modern mode does not overflow.

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

Exact-viewport review captures (system Chrome via puppeteer-core; modern JPGs are
retina @2×, the loader is an exact 1440×900 PNG):

| File | Viewport | Description |
| --- | --- | --- |
| `before-desktop.jpg` | ~1366 | Legacy Bootstrap desktop (before). |
| `before-mobile.jpg` | ~390 | Legacy Bootstrap mobile (before). |
| `review-modern-1440x900.jpg` | 1440×900 | Modern command center, default state. |
| `review-modern-progressed-1440x900.jpg` | 1440×900 | Modern shell, synthetic progressed state (Research unlocked, dense values). |
| `review-modern-1024x768.jpg` | 1024×768 | Compact desktop/tablet. |
| `review-modern-768x1024.jpg` | 768×1024 | Tablet portrait. |
| `review-modern-390x844.jpg` | 390×844 | Mobile. |
| `review-modern-360x800.jpg` | 360×800 | Narrow mobile. |
| `review-modern-progressed-390x844.jpg` | 390×844 | Mobile, progressed state. |
| `review-modern-loader-1440x900.png` | 1440×900 | Genuine modern loading screen (reactor ring), captured before `loadDelay` hid it — no artificial delay. |
| `review-legacy-1440x900.jpg` | 1440×900 | `?ui=legacy` fallback (original Bootstrap). |
| `review-legacy-390x844.jpg` | 390×844 | `?ui=legacy` fallback on mobile (inherited overflow). |

Progressed/denser states were produced with a **synthetic** in-memory state via
the game's own unlock/refresh functions — never a real player's save.

## Review-pass corrections (polish)

Two CSS-only defects found during the exact-viewport review were fixed (no DOM
contract, `.hidden`, or `?ui=legacy` behaviour changed):

1. **Empty workspace box.** `#tabContent` used `min-height:60vh`, forcing a large
   empty glass panel early-game at every viewport. Reduced to a modest floor
   (220px) so the workspace hugs its content and the deep-space canvas fills
   below. This exposed a latent **float-containment** issue (the legacy resource
   column floats left, so a short panel let the last row spill below the border);
   fixed by giving `#tabContent` `display:flow-root` to contain the float without
   clipping. Guarded by a new test.
2. **Tall mobile header.** At ≤480px the header consumed too much vertical space;
   tightened padding, favicon and brand sizes so identity + version fit compactly
   on one line (~110px vs ~180px on 360×800).

Affected viewports were re-rendered and re-verified after the fixes.

## Known limitations (intentionally deferred)

- **M2:** the resource list is only lightly restyled; the true responsive
  resource-card dashboard (and wrapping/replacing `#resourceNavParent`) is M2.
- **M3:** research/progression visualization.
- **M4:** interactive solar-system / interstellar experience.
- **M5:** deeper accessibility passes (full ARIA/live-region audit, audio),
  motion polish.
- **Fonts:** Orbitron still loads from Google Fonts (graceful fallback); optional
  self-hosting deferred (see PRIVACY.md).
- **Legacy fallback on mobile:** `?ui=legacy` at 390px overflows horizontally
  (scrollWidth 405) — this is the **inherited** original Bootstrap layout (fixed
  380px resource column), not a modern-mode defect. The modern shell fixes it;
  the legacy fallback intentionally preserves the original presentation.
- **Desktop horizontal whitespace:** on the Resources tab the right side of the
  workspace is empty until a resource is selected (the legacy content model —
  the detail pane fills on selection). The responsive resource dashboard that
  uses this width is **M2**; M1 does not redesign the resource layout.
- **Viewport clamp (resolved):** exact 1440 and sub-500 widths are now rendered
  precisely via puppeteer-core + system Chrome (earlier passes were limited by
  the extension window clamp).

## Privacy / network findings

Google Analytics and the Kongregate API script removed; only Google Fonts
(Orbitron) remains as an external call, with a system fallback. Full details and
evidence in [PRIVACY.md](PRIVACY.md).
