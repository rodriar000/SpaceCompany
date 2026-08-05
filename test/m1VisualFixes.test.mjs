/*
 * Regression guards for the four externally-identified M1 visual defects and
 * their fixes. Static structural assertions over the modern CSS + index.html.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const base = stripComments(read('styles/modern/base.css'));
const components = stripComments(read('styles/modern/components.css'));
const responsive = stripComments(read('styles/modern/responsive.css'));
const shell = stripComments(read('styles/modern/shell.css'));
const html = read('index.html');

/* --- BLOCKER 1: notification containment ---------------------------------- */

test('base.css never forces position:relative on .ui-pnotify (the root cause)', () => {
  // The original bug: .ui-pnotify lumped into a position:relative rule, which
  // broke PNotify stacking and dropped toasts off the left edge.
  for (const rule of base.split('}')) {
    if (!/\.ui-pnotify\b/.test(rule.split('{')[0] || '')) continue;
    assert.doesNotMatch(rule, /position\s*:\s*relative/i,
      '.ui-pnotify must not be given position:relative in base.css');
  }
});

test('components.css contains notifications with a viewport-fixed, viewport-aware width', () => {
  const rule = /\.ui-pnotify\s*\{[^}]*\}/i.exec(components);
  assert.ok(rule, 'a .ui-pnotify rule exists in components.css');
  assert.match(rule[0], /position\s*:\s*fixed/i, 'notifications are position:fixed');
  // Viewport-aware width so they never exceed the screen on mobile.
  assert.match(rule[0], /calc\(\s*100vw/i, 'notification width is viewport-aware (calc(100vw - ...))');
  assert.match(rule[0], /right\s*:\s*\d/i, 'notifications anchor with a right margin');
});

test('notification text is set to wrap (no forced overflow)', () => {
  assert.match(components, /ui-pnotify-title[\s\S]{0,120}overflow-wrap|overflow-wrap[\s\S]{0,120}ui-pnotify/i,
    'notification title/text wraps');
});

/* --- BLOCKER 2: mobile navigation reachability ---------------------------- */

test('mobile navigation wraps so every item stays reachable (no clip)', () => {
  // In the <=480 media block, #tabList must wrap (not rely on scroll discovery).
  const mobile = /@media[^{]*max-width:\s*480px[^{]*\{([\s\S]*?)\n\}/i.exec(responsive)
    || { 1: responsive };
  const block = mobile[1];
  assert.match(block, /#tabList[^}]*flex-wrap\s*:\s*wrap/i,
    '#tabList must use flex-wrap:wrap on mobile');
  // The desktop pull-right auto-margin must be neutralised so wrapped items pack.
  assert.match(block, /pull-right[^}]*margin-left\s*:\s*0/i,
    'pull-right auto-margin neutralised on mobile');
});

/* --- BLOCKER 3: header logo contrast -------------------------------------- */

test('header logo uses a high-contrast (inverted) treatment', () => {
  const rule = /navbar-brand img\[src\*="Favicon"\]\s*\{[^}]*\}/i.exec(shell);
  assert.ok(rule, 'the header favicon rule exists');
  assert.match(rule[0], /brightness\(0\)/i, 'favicon inverted to a light mark');
  assert.match(rule[0], /invert\(1\)/i, 'favicon inverted to a light mark');
});

/* --- BLOCKER 4: inherited Discord promo removed --------------------------- */

test('the inherited header Discord promotion is absent from index.html', () => {
  assert.doesNotMatch(html, /Join our Discord!/i, 'no "Join our Discord!" promo');
  assert.equal(html.includes('discord.gg/hgRUjVp'), false, 'no inherited header Discord link');
});

test('credits/support content is not gutted (attribution preserved)', () => {
  // The removal targeted only the header promo — the Help/FAQ support links and
  // sparticle999 attribution remain intact.
  assert.ok(html.includes('sparticle999'), 'original author attribution preserved');
});
