# Risk Register (M0)

Risks identified during the M0 forensics pass, before any change was made. Each
lists likelihood/impact, the mitigation applied in M0, and what to watch in
later milestones. This register is the safety context for all later work.

Baseline: `da4881e465a3a713ff0ccf26efc7c30aad905a87`.

| # | Risk | Likelihood | Impact | M0 mitigation |
| - | ---- | ---------- | ------ | ------------- |
| R1 | **Save data loss / corruption.** Single `localStorage["save"]` slot; ~180 globals + module data serialized together. A rename or schema slip silently drops progress. | Med | **Critical** | Documented the full schema & invariants (SAVE_COMPATIBILITY.md); characterization tests lock save/load round-trip, schema key presence, `spaceMetal→lunarite` alias, null tolerance, and import/export rules. |
| R2 | **Global mutable state.** All state is browser globals shared across ~45 scripts with load-order coupling. Any refactor risks breaking implicit dependencies. | High | High | Documented load order (derived from `index.html`) and state ownership; build derives order from `index.html` so it can't drift; lint parses every file. Engine extraction deferred to M6 behind the test suite. |
| R3 | **Balance/economy regression.** Costs, rates, and unlocks are plain globals easy to change by accident. | Med | High | Pinned representative cost constants and initial state in `test/costModel.test.mjs` and `test/initialState.test.mjs` as a balance-regression guard. Hard rule: no economy changes in M0. |
| R4 | **Broken/misleading legacy build (Grunt).** `Gruntfile.js` references a non-existent `loading.js` and is disconnected from the runtime (`SpaceCompany.min.js` commented out). Running it fails; trusting it misleads. | High (already broken) | Low | Documented as broken/unused; superseded by a deterministic zero-dep `scripts/build.mjs`. `Gruntfile.js` left untouched; dead grunt devDeps removed. |
| R5 | **Offline-gain / clock abuse.** Offline progress trusts `lastFixedUpdate` vs. wall clock; negative or skewed durations could misbehave. | Low | Med | Characterized the `handleOfflineGains(<=0)` no-op guard; documented `lastFixedUpdate` semantics as an invariant. |
| R6 | **Privacy: active Google Analytics + Kongregate calls** embedded in `index.html`. Hard rule forbids *adding* analytics; existing telemetry is a privacy concern for a modernization fork. | High (present) | Med | **Documented, not changed in M0** (non-destructive). Flagged for an explicit decision in M1 (recommend removing GA / making third-party calls opt-in). Not silently altered. |
| R7 | **External runtime dependencies** (Google Fonts, Kongregate, oembed to `sparticle999.github.io`). Offline/dev environments can't reach them. | Med | Low | Verified the game loads and runs locally with these failing gracefully (browser smoke test passed with no fatal console errors). Documented in LEGACY_ARCHITECTURE.md. |
| R8 | **Vulnerable/obsolete vendored libraries** (`lib/`: old jQuery, Bootstrap, Handlebars, PNotify, lz-string). | Med | Med | **Not upgraded in M0** (hard rule: no blind upgrades; behavioural risk). Inventoried for a deliberate, tested upgrade in a later milestone. lz-string in particular is load-bearing for save compat and must be regression-tested before any bump. |
| R9 | **Version metadata mismatch.** `package.json` says `0.4.3`; runtime `versionNumber` is `V0.5.1.2 Beta`. | Low | Low | Recorded; not "fixed" to avoid touching a value some save/migration logic reads. Revisit when introducing real versioning in M1. |
| R10 | **Accidental deploy/branch damage.** Work could land on `dev`/`gh-pages` and break the live legacy game. | Low | High | All work isolated on `feature/m0-modernization-foundation`; `gh-pages` left untouched and remains the deployable branch; nothing merged or pushed. |
| R11 | **Generated artifact committed.** Committing `SpaceCompany.min.js` or `node_modules` would pollute history. | Low | Low | `.gitignore` covers `SpaceCompany.min.js`, `node_modules/`, editor/OS state; build writes only the ignored artifact. |

## Standing rules carried forward

- Saves are sacred: no key/serialization/economy change without a tested forward migration (SAVE_COMPATIBILITY.md).
- Characterize before refactor: extend the `test/` suite before moving legacy code.
- `gh-pages` stays deployable until M8 explicitly migrates deployment.
- No blind dependency upgrades; each vendored-lib bump needs a regression pass.
