/*
 * M1 shell integrity: static assertions over index.html and the modern assets.
 * These protect the command-center shell + the DOM contract legacy code relies
 * on, and lock the privacy cleanup (no Google Analytics / Kongregate at runtime).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');

/** Count non-overlapping occurrences of a substring. */
const count = (s, sub) => s.split(sub).length - 1;

test('modern design-system assets exist and are referenced by index.html', () => {
  const assets = [
    'styles/modern/tokens.css',
    'styles/modern/base.css',
    'styles/modern/shell.css',
    'styles/modern/components.css',
    'styles/modern/responsive.css',
    'ui/modern/shell.js',
  ];
  for (const a of assets) {
    assert.ok(existsSync(join(ROOT, a)), `${a} must exist`);
    assert.ok(readFileSync(join(ROOT, a), 'utf8').trim().length > 0, `${a} must not be empty`);
    assert.ok(html.includes(a), `index.html must reference ${a}`);
  }
});

test('modern CSS loads AFTER legacy style.css so it layers over Bootstrap', () => {
  // Anchor on the actual <link href="..."> (not prose mentions in comments).
  assert.ok(html.indexOf('href="styles/modern/tokens.css"') > html.indexOf('href="style.css"'),
    'tokens.css must be linked after style.css');
  assert.ok(html.indexOf('href="lib/bootstrap.min.css"') < html.indexOf('href="styles/modern/shell.css"'),
    'modern shell must load after bootstrap');
});

test('default UI mode is modern with a FOUC-safe query switch', () => {
  assert.match(html, /<html[^>]*\bdata-ui="modern"/, 'html defaults to data-ui="modern"');
  // Inline head script resolves ?ui=legacy before stylesheets apply.
  assert.match(html, /setAttribute\('data-ui'[^)]*ui=legacy/i,
    'an inline script must resolve ?ui=legacy for FOUC safety');
});

test('privacy: Google Analytics is fully removed from runtime', () => {
  assert.equal(count(html, 'UA-75489477'), 0, 'no GA tracking id');
  assert.equal(count(html, 'google-analytics.com'), 0, 'no GA script host');
  assert.equal(count(html, "ga('create'"), 0, 'no GA create call');
  assert.equal(count(html, "ga('send'"), 0, 'no GA pageview call');
});

test('privacy: the Kongregate API runtime script is removed', () => {
  assert.equal(count(html, 'cdn1.kongregate.com'), 0, 'no kongregate api script host');
  assert.equal(count(html, 'kongregateAPI.loadAPI'), 0, 'no kongregate init');
});

test('critical DOM-contract IDs are preserved and unique', () => {
  const criticalIds = [
    'loadScreen', 'loadLogo', 'splashText', 'game', 'companyName', 'versionLabel',
    'energyLow', 'autoSaveTimer', 'tabList', 'tabContent', 'resourceNavParent',
    'metalNav', 'gemNav', 'woodNav', 'resources',
  ];
  for (const id of criticalIds) {
    const n = count(html, `id="${id}"`);
    assert.equal(n, 1, `id="${id}" must appear exactly once (found ${n})`);
  }
});

test('primary tab targets and their panes are preserved', () => {
  // Each top-level tab anchor href="#X" must have a matching pane id="X".
  const tabs = ['resources', 'research', 'solarSystem', 'wonder', 'more'];
  for (const t of tabs) {
    assert.ok(html.includes(`href="#${t}"`), `tab link href="#${t}" preserved`);
    assert.ok(html.includes(`id="${t}"`), `tab pane id="${t}" preserved`);
  }
});

test('the .hidden visibility contract is not overridden by modern CSS', () => {
  // For any rule whose selector references `.hidden`, the only permitted display
  // value is `none` (anything else would expose locked tabs/resources).
  for (const css of ['tokens.css', 'base.css', 'shell.css', 'components.css', 'responsive.css']) {
    // Strip CSS comments so prose that mentions ".hidden" is not parsed as a rule.
    const src = readFileSync(join(ROOT, 'styles/modern', css), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const rule of src.split('}')) {
      const brace = rule.indexOf('{');
      if (brace === -1) continue;
      const selector = rule.slice(0, brace);
      if (!/\.hidden\b/.test(selector)) continue;
      const body = rule.slice(brace + 1);
      const display = /display\s*:\s*([a-z-]+)/i.exec(body);
      if (display) {
        assert.equal(display[1].toLowerCase(), 'none',
          `${css}: a .hidden rule sets display:${display[1]} (must be none)`);
      }
    }
  }
});

test('the loading-screen hide contract is respected (only display:none on .hidden)', () => {
  const shell = readFileSync(join(ROOT, 'styles/modern/shell.css'), 'utf8');
  // If shell.css references #loadScreen.hidden it must keep it display:none.
  if (/#loadScreen\.hidden/.test(shell)) {
    assert.match(shell, /#loadScreen\.hidden\s*\{\s*display:\s*none/,
      '#loadScreen.hidden must remain display:none');
  }
});
