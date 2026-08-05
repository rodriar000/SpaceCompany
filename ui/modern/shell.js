/* ============================================================================
 * Space Company — Modern Command-Center Shell (first-party, M1)
 *
 * Responsibilities (presentation only):
 *   1. Resolve the UI mode from the URL (?ui=legacy -> legacy, else modern) and
 *      reflect it on <html data-ui="...">. This is the diagnostic escape hatch.
 *   2. Small, non-destructive accessibility/shell enhancements.
 *
 * HARD CONSTRAINTS:
 *   - Never touches localStorage["save"], exported saves, or any game state.
 *   - Never changes gameplay, balance, or the save schema.
 *   - The mode is derived from the URL each load; it is NOT persisted into the
 *     save. (A future milestone may add a non-save preference; not in M1.)
 *   - Never overrides .hidden / display logic used by legacy code.
 * ==========================================================================*/
(function () {
  'use strict';

  var LEGACY = 'legacy';
  var MODERN = 'modern';

  /** Resolve mode from the query string without touching storage. */
  function resolveMode() {
    var search = (window.location && window.location.search) || '';
    return /[?&]ui=legacy(?:&|$)/i.test(search) ? LEGACY : MODERN;
  }

  var mode = resolveMode();

  // Reflect the mode as early as possible (idempotent with the inline head
  // snippet that prevents a flash of unstyled content).
  if (document.documentElement.getAttribute('data-ui') !== mode) {
    document.documentElement.setAttribute('data-ui', mode);
  }

  // Public, read-only-ish hook for tests and diagnostics. Not gameplay state.
  window.SpaceCompanyShell = {
    mode: mode,
    isModern: mode === MODERN,
    version: 'm1'
  };

  /** Non-destructive enhancements once the DOM is ready. */
  function enhance() {
    if (mode !== MODERN) return;

    // Label the primary navigation for assistive tech (adds an attribute only).
    var tabList = document.getElementById('tabList');
    if (tabList && !tabList.getAttribute('aria-label')) {
      tabList.setAttribute('aria-label', 'Primary sections');
    }

    // Defensive: ensure the loader ring exists in the loading screen even if the
    // static markup is absent. Purely decorative; no IDs, no state.
    var loadScreen = document.getElementById('loadScreen');
    var splash = document.getElementById('splashText');
    if (loadScreen && splash && !loadScreen.querySelector('.sc-loader-ring')) {
      var ring = document.createElement('div');
      ring.className = 'sc-loader-ring';
      ring.setAttribute('aria-hidden', 'true');
      loadScreen.insertBefore(ring, splash);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhance);
  } else {
    enhance();
  }
})();
