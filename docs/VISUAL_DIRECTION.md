# Visual Direction

A proposed premium science-fiction visual language for the modernization. This
is **direction, not implementation** — nothing here is built in M0. It guides
M1+ (see [MODERNIZATION_ROADMAP.md](MODERNIZATION_ROADMAP.md)).

**Influences**

- **Stellaris** — dense but legible information hierarchy; calm dark canvas with
  bright, meaningful accents; numbers and rates presented without clutter.
- **EVE Online** — industrial, engineered atmosphere; metal/graphite surfaces,
  thin precise lines, a feeling of operating heavy machinery.
- **Modern incremental games** — clarity and scannability first; resource state
  readable at a glance; progress always visible.

## Visual principles

1. **Clarity over decoration.** Every pixel serves a number, a rate, or a state.
   The game is a dashboard for an interstellar company.
2. **Calm canvas, bright signal.** A dark, low-noise background lets resource
   values, gains, and alerts carry the colour.
3. **Engineered, not glossy.** Precise lines, restrained gradients, subtle depth
   — hardware, not neon.
4. **State is legible.** Affordable/unaffordable, full/producing/idle, locked/
   unlocked must be instantly distinguishable by more than colour alone.
5. **Respect the veteran.** Late-game players scan huge numbers fast; density and
   alignment matter more than whitespace flourish.

## Colour

Dark-first, with a light theme as a first-class citizen. Semantics are fixed;
the exact hex values are tokens to be tuned in M1.

- **Canvas / surfaces:** near-black graphite (`#0b0f14`) → elevated panels in
  slightly lighter slate. Light theme inverts to soft off-white, never pure white.
- **Primary accent:** a cool cyan/teal ("reactor glow") for interactive and
  active states.
- **Secondary accent:** amber/gold for wonders, prestige, and premium moments.
- **Semantic:**
  - *positive / affordable / gain:* green.
  - *negative / unaffordable / deficit:* red (preserving the legacy "red cost"
    convention players already know).
  - *warning / storage full:* amber.
  - *info / neutral rate:* muted blue-grey.
- **Rule:** colour never the sole carrier of meaning — pair with icon, label, or
  weight (accessibility).

## Typography

- **Display / headings:** a geometric sci-fi face in the spirit of the existing
  **Orbitron** (already loaded) for the wordmark and section titles — used
  sparingly.
- **UI / body:** a highly legible humanist or grotesk sans (e.g. Inter-like) for
  labels and descriptions.
- **Numerics:** a **tabular / monospaced-figure** treatment so resource columns
  and rates align vertically and don't jitter as values change.
- **Scale:** a modest type scale (~1.2 ratio); at most 3–4 sizes on a screen.

## Spacing

- An **8px base grid** (4px for fine adjustments). Consistent multiples for
  padding, gaps, and card rhythm.
- Denser on data tables/cards (veteran scannability), more generous around
  primary actions and empty states.

## Surfaces

- **Elevation via subtle layering**, not heavy shadow: panel = canvas + 1 step
  lighter, hairline border, faint inner highlight at the top edge.
- Corner radius small and consistent (~4–6px) — engineered, not pill-soft.
- Optional very subtle texture/grid on the deepest canvas only; never on cards.

## Navigation

- Persistent **top bar**: company identity, prestige/rank, and a compact global
  resource strip that's always visible.
- **Primary sections** as a rail (resources, research, solar system, wonders,
  interstellar, stats/settings) — icon + label, clear active state.
- Preserve the mental model of the current tabbed layout so existing players
  aren't disoriented; modernize the styling and responsiveness, not the map.

## Resource cards

The core repeating unit. Each card shows, at a glance:

- Icon + resource name.
- **Current / capacity** with a fill indicator.
- **Per-second rate**, coloured by sign (green/red), with tabular figures.
- Affordability state reflected on associated actions.
- Optional **time-to-full / time-to-empty** (the legacy game already computes
  this) as secondary text.

Cards must degrade gracefully to a dense **table** row on small viewports and
for players with dozens of resources late game.

## Progress indicators

- **Linear meters** for storage fill and research/wonder progress; show the
  number, not just the bar.
- **Radial/segmented** indicators for large staged builds (e.g. Dyson segments)
  where discrete counts matter.
- Always pair a bar with its exact value and, where relevant, an ETA.
- Deterministic, non-distracting; no indefinite spinners for known-progress work.

## Motion principles

- **Motion clarifies, never entertains.** Value changes tween briefly (the
  legacy game already "scrolls" numbers up); state changes cross-fade.
- Durations short (~120–240ms), eased; nothing blocks input.
- **Honour `prefers-reduced-motion`** — reduce to instant state changes.
- No parallax or ambient animation that competes with live numbers.

## Responsive behaviour

- **Mobile-first fluid layout.** Single-column stacked cards on phones; multi-
  column grid on tablet/desktop; dense multi-pane on wide screens.
- Global resource strip collapses into a scrollable/expandable summary on narrow
  screens.
- Touch targets ≥ 44px; hover-only affordances always have a tap equivalent.
- Preserve the existing `viewport` meta behaviour; never require horizontal
  scrolling of the page body (wide tables scroll within their own container).

## Accessibility constraints

- **Contrast:** text and meaningful UI meet WCAG 2.1 AA (≥ 4.5:1 body, ≥ 3:1
  large text / UI components) in both themes.
- **Not colour-alone:** affordability and status use icon/shape/label in
  addition to colour (protects red/green colour-blind players — critical given
  the "red cost" convention).
- **Keyboard:** every action reachable and operable by keyboard with a visible
  focus ring; logical tab order.
- **Semantics:** real roles/labels (buttons are buttons), live regions for
  important async updates (offline gains, storage full) — announced, not just
  flashed.
- **Motion & audio:** respect reduced-motion; any audio is opt-in and muted by
  default with a persistent control.
