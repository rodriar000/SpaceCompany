/*
 * M5a — selected legacy rows (`.info`) must stay legible under the modern shell.
 *
 * Bootstrap marks the active row by painting the CELL `#d9edf7`, a light blue
 * meant for a light theme. Under the modern dark shell the body text is
 * near-white, which measured 1.03:1 — the row stayed present but its name, rate
 * and amount were invisible. M3 and M4 had each patched their own pane, so the
 * defect survived wherever those per-pane rules do not apply:
 *   ?research=legacy  -> "Science Production" (the user's "Research")
 *   ?space=legacy     -> "Rocket Fuel"        (the user's "Space Fuel")
 *   ?resources=legacy -> all 17 resource rows
 *
 * These tests lock the general correction in `styles/modern/components.css` and
 * guard against it being narrowed to a per-resource special case.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers/loadLegacy.mjs';

const components = readFileSync(join(ROOT, 'styles/modern/components.css'), 'utf8');
const tokens = readFileSync(join(ROOT, 'styles/modern/tokens.css'), 'utf8');
const resources = readFileSync(join(ROOT, 'styles/modern/resources.css'), 'utf8');

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const body = stripComments(components);

/** Selectors of every rule whose declaration block matches `test`. */
function rulesMatching(css, test) {
  const out = [];
  for (const m of stripComments(css).matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (test.test(m[2])) out.push(m[1].trim().replace(/\s+/g, ' '));
  }
  return out;
}

/** WCAG relative luminance / contrast, for the token assertions below. */
function luminance(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)];
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}
function token(name) {
  const m = tokens.match(new RegExp('--' + name + ':\\s*(#[0-9a-fA-F]{3,8})'));
  assert.ok(m, 'token --' + name + ' not found');
  return m[1];
}

/* ========================================================================== *
 * The correction exists, is general, and is scoped to the modern shell
 * ========================================================================== */

test('selected legacy rows get a modern background and readable text', () => {
  const rules = rulesMatching(components, /background-color:\s*var\(--sc-cyan-faint\)/);
  const infoRule = rules.find((s) => /tr\.info/.test(s));

  assert.ok(infoRule, 'no rule restyles tr.info');
  assert.match(infoRule, /html\[data-ui="modern"\]/, 'must be scoped to the modern shell');
  assert.match(infoRule, /tr\.info\s*>\s*td/, 'Bootstrap paints the CELL, so the cell must be targeted');
});

test('the correction covers every pane, not one resource', () => {
  const infoRules = rulesMatching(components, /--sc-cyan-faint|--sc-text-strong/)
    .filter((s) => /tr\.info/.test(s));
  assert.ok(infoRules.length > 0);

  const joined = infoRules.join(' ');
  // No id-based or resource-name-based narrowing anywhere in the fix.
  for (const forbidden of [
    /#science/i, /#rocketFuel/i, /#metalNav/i, /scienceNav/i, /rocketFuelNav/i,
    /#research\b/, /#solarSystem\b/, /#resourceNavParent/
  ]) {
    assert.ok(!forbidden.test(joined),
      'the selected-row fix must not be special-cased: ' + forbidden);
  }
});

test('no resource-specific selector was introduced anywhere in the modern CSS', () => {
  for (const [name, css] of [['components.css', components], ['resources.css', resources]]) {
    const text = stripComments(css);
    for (const forbidden of [/scienceNav\s*\.info/, /rocketFuelNav\s*\.info/,
      /\.info[^{]*#\s*science/, /\.info[^{]*#\s*rocketFuel/]) {
      assert.ok(!forbidden.test(text), name + ' contains a resource-specific selected-state hack');
    }
  }
});

test('the full legacy presentation is untouched', () => {
  const infoRules = rulesMatching(components, /--sc-cyan-faint|--sc-text-strong/)
    .filter((s) => /tr\.info/.test(s));
  for (const rule of infoRules) {
    for (const part of rule.split(',')) {
      assert.match(part.trim(), /^html\[data-ui="modern"\]/,
        '?ui=legacy must keep Bootstrap\'s original appearance: ' + part.trim());
    }
  }
});

test('the fix wins the cascade without !important', () => {
  const infoRules = stripComments(components)
    .match(/html\[data-ui="modern"\][^{]*tr\.info[^{]*\{[^}]*\}/g) || [];
  assert.ok(infoRules.length > 0);
  for (const rule of infoRules) {
    assert.ok(!/!important/.test(rule),
      'specificity (0,3,4) already beats Bootstrap (0,2,3); !important is unnecessary: ' + rule);
  }
});

/* ========================================================================== *
 * The selected state stays meaningful
 * ========================================================================== */

test('selection is not signalled by colour alone', () => {
  const edge = rulesMatching(components, /box-shadow:\s*inset/).find((s) => /tr\.info/.test(s));
  assert.ok(edge, 'the selected row needs a non-colour cue (a solid leading edge)');
  assert.match(edge, /td:first-child/);
});

test('semantic value colours still win on a selected row', () => {
  const text = stripComments(components);
  assert.match(text, /tr\.info\s*>\s*td\s*\.red[\s\S]{0,120}--sc-negative/,
    'a deficit must stay red on the selected row');
  assert.match(text, /tr\.info\s*>\s*td\s*\.green[\s\S]{0,120}--sc-positive/,
    'a positive value must stay green on the selected row');
});

test('the selected background keeps strong text contrast', () => {
  // --sc-cyan-faint is a translucent wash over the dark surface, so the
  // effective background stays dark and --sc-text-strong stays high-contrast.
  assert.match(tokens, /--sc-cyan-faint:\s*rgba\(/, 'the wash must be translucent, not a solid light block');
  const ratio = contrast(token('sc-text-strong'), token('sc-surface-1'));
  assert.ok(ratio >= 4.5, 'selected-row text contrast ' + ratio.toFixed(2) + ':1');
});

/* ========================================================================== *
 * Muted telemetry contrast
 * ========================================================================== */

test('muted card telemetry clears 4.5:1 on the card surface', () => {
  const ratio = contrast(token('sc-text-muted'), token('sc-surface-1'));
  assert.ok(ratio >= 4.5,
    '--sc-text-muted on --sc-surface-1 is ' + ratio.toFixed(2) + ':1, below AA for normal text');
});

test('the other text tokens still clear their targets', () => {
  const surface = token('sc-surface-1');
  for (const [name, min] of [['sc-text', 4.5], ['sc-text-strong', 4.5], ['sc-text-secondary', 4.5]]) {
    const ratio = contrast(token(name), surface);
    assert.ok(ratio >= min, `--${name} is ${ratio.toFixed(2)}:1 on the card surface`);
  }
});

test('the visual identity is preserved — muted text is only nudged', () => {
  // A large jump would flatten the hierarchy between muted and secondary text.
  const muted = contrast(token('sc-text-muted'), token('sc-surface-1'));
  const secondary = contrast(token('sc-text-secondary'), token('sc-surface-1'));
  assert.ok(muted < secondary, 'muted must stay visually quieter than secondary text');
  assert.ok(muted < 6.5, 'muted text was lightened further than needed: ' + muted.toFixed(2));
});

/* ========================================================================== *
 * Contracts M5a must not have disturbed
 * ========================================================================== */

test('the M2 projection contract is intact', () => {
  const dashboard = readFileSync(join(ROOT, 'ui/modern/resourceDashboard.js'), 'utf8');
  assert.match(dashboard, /row\.click\(\)/, 'cards still activate by clicking the legacy row');
  assert.match(dashboard, /aria-pressed/, 'cards still mirror selection into aria-pressed');
  assert.match(dashboard, /isSelected/, 'selection is still read from the row, not assigned');
});

test('.hidden is still never restyled by the corrected files', () => {
  for (const [name, css] of [['components.css', components], ['tokens.css', tokens]]) {
    const selectors = stripComments(css).match(/([^{}]+)\{/g) || [];
    for (const sel of selectors) {
      assert.ok(!/\.hidden\b/.test(sel), name + ' must not style .hidden: ' + sel.trim());
    }
  }
});

test('the formatter memo is untouched by this correction', () => {
  const runtime = readFileSync(join(ROOT, 'ui/modern/uiRuntime.js'), 'utf8');
  assert.match(runtime, /installFormatterCache/);
  assert.match(runtime, /MAX_CACHE = 4096/, 'the cache contract is unchanged');
});
