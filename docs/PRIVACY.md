# Privacy & Network

This is Rodrigo's independently hosted modernization fork. M1 removes inherited
third-party tracking and platform integration that should not follow the fork,
and documents the remaining external network calls.

**No analytics, telemetry, cookies, tracking pixels, or consent banners are
added by this fork.**

## Removed in M1 (with evidence)

### Google Analytics — REMOVED
- **What:** the inline Universal Analytics snippet in `index.html`
  (`analytics.js` loader + `ga('create', 'UA-75489477-2', 'auto')` +
  `ga('send', 'pageview')`).
- **Dependency proof:** a full-codebase search found no other reference to `ga(`,
  `google-analytics`, or the tracking id. Nothing in the game reads GA. Removal
  cannot affect gameplay.
- **Result:** no request to `www.google-analytics.com` occurs at runtime
  (verified by network audit during browser QA). Enforced by
  `test/modernShell.test.mjs` (asserts the id/host/calls are absent).

### Kongregate API — REMOVED
- **What:** the `<script src="https://cdn1.kongregate.com/javascripts/kongregate_api.js">`
  tag in `index.html`.
- **Dependency proof:** the `kongregateAPI.loadAPI(...)` initialization block was
  already commented out, and the only in-code use
  (`ui/statisticUI.js:38` leaderboard submit) is also commented out. No runtime
  code calls `kongregate.*`.
- **Result:** no request to `cdn1.kongregate.com` at runtime. Enforced by
  `test/modernShell.test.mjs`.
- **Preserved:** the plain hyperlink to the Kongregate game page in the credits
  (an ordinary link that generates no on-load network call) is left intact — the
  privacy cleanup did not touch attribution/credits.

## Retained external call (audited)

### Google Fonts — Orbitron (RETAINED with graceful fallback)
- **What:** `<link href="https://fonts.googleapis.com/css?family=Orbitron">`,
  used for the display wordmark and section headings.
- **Decision:** retained for the sci-fi identity. It is **not** tracking, and the
  UI is fully functional without it: `--sc-font-display` in
  `styles/modern/tokens.css` falls back to a system stack
  (`'Eurostile', 'Bank Gothic', system sans`) if the remote font fails or is
  blocked. No layout depends on the font loading.
- **Privacy note:** Google Fonts may log the requesting IP. A future milestone
  may self-host Orbitron (SIL Open Font License) after verifying and bundling the
  licence, which would remove this last third-party call. It was **not**
  downloaded/redistributed in M1 because that requires licence verification and
  is out of scope here.

## Runtime network calls after M1

| Host | Purpose | Required? |
| --- | --- | --- |
| (same origin) | All game HTML/CSS/JS/icons/fonts-fallback | Yes |
| `fonts.googleapis.com` / `fonts.gstatic.com` | Orbitron display font | No — graceful fallback |

No other external hosts are contacted at runtime.

## Storage

- The only storage the game uses is `localStorage["save"]` (plain JSON), plus
  incidental library storage. M1 adds **no** new persistent storage.
- The UI-mode switch (`?ui=legacy`) is derived from the URL on each load and is
  **never** persisted — it does not touch the save. Enforced by
  `test/uiModeSwitch.test.mjs`.
