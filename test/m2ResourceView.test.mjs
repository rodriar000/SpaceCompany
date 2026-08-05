/*
 * M2 view-swap integrity: static assertions over index.html and
 * styles/modern/resources.css.
 *
 * The dashboard is a projection of the legacy resource list, so the milestone's
 * safety properties are as much about what stayed intact as about what is new:
 * the legacy rows, their IDs, their data-bound spans and their handlers must all
 * survive, the swap must be conditional on the dashboard actually existing, and
 * the modern CSS must not touch the visibility contracts legacy code relies on.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const html = read('index.html');
const css = read('styles/modern/resources.css').replace(/\/\*[\s\S]*?\*\//g, '');

/** The legacy resource table, extracted from index.html. */
const table = (() => {
  const start = html.indexOf('id="resourceNavParent"');
  assert.notEqual(start, -1, 'the legacy resource table must still exist');
  const end = html.indexOf('</table>', start);
  return html.slice(start, end);
})();

const navRows = [...table.matchAll(/<tr\s+id="(\w+)Nav"([\s\S]*?)<\/tr>/g)];

/* --- The projection's input contract --------------------------------------- */

test('the legacy resource list still has the shape the projection reads', () => {
  assert.ok(navRows.length >= 19, `expected the full resource list, found ${navRows.length}`);
  for (const [row, id, body] of navRows) {
    assert.match(body, /<img[^>]+src="Icons\/[^"]+"/, `${id}Nav must carry its icon`);
    const cells = body.match(/<td\b/g) || [];
    assert.ok(cells.length >= 4, `${id}Nav must keep its 4 cells (found ${cells.length})`);
    assert.match(row, new RegExp(`onclick="activeResourceTab\\('${id}Nav'\\)"`),
      `${id}Nav must keep its legacy click handler`);
    assert.match(row, /data-toggle="tab"/, `${id}Nav must keep the Bootstrap tab data-api hook`);
    assert.ok(body.includes(`id="${id}ps"`), `${id}Nav must keep its per-second binding`);
  }
});

test('the category header rows the grouping is derived from are preserved', () => {
  for (const id of ['collapseEarth', 'collapseInnerPlanet', 'collapseOuterPlanet']) {
    assert.ok(table.includes(`id="${id}"`), `${id} must remain to seed a card group`);
  }
});

test('the legacy rows keep their lock classes (the source of truth for "locked")', () => {
  const locked = navRows.filter(([row]) => /class="[^"]*\bhidden\b/.test(row));
  assert.ok(locked.length > 10,
    'most resources start locked via .hidden; the dashboard only mirrors that');
});

/* --- Wiring ---------------------------------------------------------------- */

test('the resource view mode is resolved from the URL before stylesheets (FOUC-safe)', () => {
  assert.match(html, /setAttribute\('data-resources'[^)]*resources\)?=legacy/i,
    'an inline head script must resolve ?resources=legacy');
  // Resolved in <head>, ahead of the modern stylesheets that consume it.
  assert.ok(html.indexOf("setAttribute('data-resources'") < html.indexOf('styles/modern/resources.css'),
    'the attribute is set before the stylesheet that keys off it');
});

test('?ui=legacy also restores the legacy resource table', () => {
  const inline = /setAttribute\('data-resources'.*/i.exec(html)[0];
  assert.match(inline, /ui\|resources|resources\|ui/,
    'the global legacy switch must also fall back to the legacy list');
});

test('the dashboard script loads after the legacy resource UI it borrows from', () => {
  assert.ok(html.indexOf('src="ui/resourceUI.js"') < html.indexOf('src="ui/modern/resourceDashboard.js"'),
    'resourceUI.js defines the formatting delegates the dashboard reuses');
  assert.ok(html.indexOf('src="game.js"') < html.indexOf('src="ui/modern/resourceDashboard.js"'),
    'Game.uiComponents must exist before the dashboard registers');
});

/* --- CSS safety ------------------------------------------------------------ */

test('the legacy column is hidden ONLY when the dashboard is really in the DOM', () => {
  const rules = css.split('}').filter((r) => /col-xs-1/.test(r.split('{')[0] || ''));
  assert.ok(rules.length > 0, 'a rule hides the legacy resource column');
  for (const rule of rules) {
    const selector = rule.split('{')[0];
    if (!/display\s*:\s*none/i.test(rule)) continue;
    assert.match(selector, /#scResourceDashboard\s*~/,
      'hiding the legacy column must be conditional on the dashboard sibling, ' +
      'so a failed build leaves the legacy list visible');
  }
});

test('the swap is scoped to modern + cards mode', () => {
  for (const rule of css.split('}')) {
    const selector = (rule.split('{')[0] || '').trim();
    if (!selector || !/#resourceTabParent|col-xs-1/.test(selector)) continue;
    assert.match(selector, /html\[data-ui="modern"\]\[data-resources="cards"\]/,
      `view-swap rule must be scoped to modern+cards: ${selector.slice(0, 90)}`);
  }
});

test('Bootstrap tab display logic is never overridden', () => {
  for (const rule of css.split('}')) {
    const selector = (rule.split('{')[0] || '').trim();
    if (!/\.tab-pane|\.fade\b|\.in\b|\.active\b/.test(selector)) continue;
    assert.doesNotMatch(rule.split('{')[1] || '', /display\s*:/i,
      `must not set display on tab machinery: ${selector.slice(0, 90)}`);
  }
});

test('no rule in the resource stylesheet touches the .hidden contract', () => {
  for (const rule of css.split('}')) {
    const selector = rule.split('{')[0] || '';
    assert.doesNotMatch(selector, /\.hidden\b/,
      'the dashboard mirrors .hidden via its own class; it never restyles it');
  }
});

test('cards degrade to a dense single-column row on phones', () => {
  const mobile = /@media\s*\(max-width:\s*560px\)\s*\{([\s\S]*?)\n\}/.exec(css);
  assert.ok(mobile, 'a phone breakpoint exists');
  assert.match(mobile[1], /\.sc-res-grid[^}]*grid-template-columns:\s*1fr/,
    'one column on phones');
  assert.match(mobile[1], /\.sc-res-card[^}]*min-height:\s*(4[4-9]|[5-9]\d)px/,
    'touch targets stay comfortably above 44px');
});

test('motion is reduced when the player asks for it', () => {
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/,
    'reduced-motion is honoured');
});
