/*
 * M5 — shared modern UI runtime: preferences, motion policy, formatter
 * memoisation and the live-region announcer.
 *
 * The formatter tests run the REAL `utils.js` formatters through the REAL
 * memoising wrapper, so "byte-identical output" is a property of the shipped
 * code rather than of a fixture.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadFiles, ROOT } from './helpers/loadLegacy.mjs';
import { createDocument } from './helpers/miniDom.mjs';

const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** A localStorage stand-in that can also simulate being unavailable. */
function makeStorage(initial = {}, { throwing = false } = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get length() { return map.size; },
    key(i) { return Array.from(map.keys())[i] ?? null; },
    getItem(k) { if (throwing) throw new Error('denied'); return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { if (throwing) throw new Error('denied'); map.set(k, String(v)); },
    removeItem(k) { if (throwing) throw new Error('denied'); map.delete(k); },
    _map: map
  };
}

function mount({ storage = makeStorage(), reducedMotion = false, formatter = 'shortName' } = {}) {
  const document = createDocument();
  const matchMedia = (q) => ({
    matches: /reduce/.test(q) ? reducedMotion : false,
    addEventListener() {}, addListener() {}
  });

  const Game = { ui: {}, uiComponents: [], utils: null, settings: null };

  const ctx = loadFiles(
    ['utils.js', 'ui/modern/uiRuntime.js'],
    {
      Game, document, localStorage: storage, matchMedia,
      location: { search: '' },
      navigator: { language: 'en-US' },
      StrLoc: (s) => s
    }
  );

  // The real settings.format, over the real formatters loaded from utils.js.
  const original = function format(value, digit) {
    const f = this.entries.formatter || 'shortName';
    return ctx.Game.utils.formatters[f]((value).toFixed(digit || 0));
  };
  ctx.Game.settings = { entries: { formatter }, format: original };
  ctx.window.SpaceCompanyUI.installFormatterCache();

  return { ctx, document, api: ctx.window.SpaceCompanyUI, storage, original };
}

/* ========================================================================== *
 * Preferences
 * ========================================================================== */

test('preferences default safely and live under the sc.ui namespace', () => {
  const { api, storage } = mount();

  assert.equal(api.NAMESPACE, 'sc.ui.');
  assert.equal(api.get('motion'), 'system');
  assert.equal(api.get('announcements'), 'normal');
  assert.equal(api.get('audioEnabled'), false, 'audio must be OFF by default');
  assert.equal(api.get('audioVolume'), 0.4);

  // Nothing is written until the user actually changes something.
  assert.equal(storage._map.size, 0);

  api.set('motion', 'reduced');
  assert.equal(storage._map.get('sc.ui.motion'), 'reduced');
  assert.equal(api.get('motion'), 'reduced');
});

test('corrupted preference values fall back to the default', () => {
  const { api } = mount({
    storage: makeStorage({
      'sc.ui.motion': 'wobbly',
      'sc.ui.announcements': '{}',
      'sc.ui.audioEnabled': 'maybe',
      'sc.ui.audioVolume': 'loud'
    })
  });

  assert.equal(api.get('motion'), 'system');
  assert.equal(api.get('announcements'), 'normal');
  assert.equal(api.get('audioEnabled'), false);
  assert.equal(api.get('audioVolume'), 0.4);
});

test('volume is clamped and unknown keys are rejected', () => {
  const { api } = mount({ storage: makeStorage({ 'sc.ui.audioVolume': '9' }) });
  assert.equal(api.get('audioVolume'), 1);

  assert.equal(api.set('gameplayCheat', true), false, 'only known preferences may be set');
});

test('unavailable storage never throws and still yields defaults', () => {
  const { api } = mount({ storage: makeStorage({}, { throwing: true }) });
  assert.equal(api.get('motion'), 'system');
  assert.equal(api.set('motion', 'reduced'), false);
  assert.doesNotThrow(() => api.resetPreferences());
});

test('resetting preferences removes only sc.ui.* and never the save', () => {
  const storage = makeStorage({
    save: '{"companyName":"Sentinel"}',
    'sc.ui.motion': 'reduced',
    'sc.ui.audioEnabled': 'true',
    'sc.ui.resourceDensity': 'compact',
    'unrelated.key': 'keep'
  });
  const { api } = mount({ storage });

  const removed = api.resetPreferences();

  assert.equal(removed, 3, 'exactly the three sc.ui.* keys');
  assert.equal(storage._map.get('save'), '{"companyName":"Sentinel"}', 'the save is untouched');
  assert.equal(storage._map.get('unrelated.key'), 'keep');
  assert.equal(storage._map.has('sc.ui.motion'), false);
  assert.equal(storage._map.has('sc.ui.resourceDensity'), false);
});

test('no preference name can collide with a save key', () => {
  const { api } = mount();
  for (const key of Object.keys(api.DEFAULTS)) {
    assert.ok(!/^save$/.test(key));
    assert.ok((api.NAMESPACE + key).startsWith('sc.ui.'));
  }
});

/* ========================================================================== *
 * Motion policy
 * ========================================================================== */

test('motion follows the system preference by default and can be overridden', () => {
  const off = mount({ reducedMotion: false });
  assert.equal(off.api.systemReducedMotion(), false);
  assert.equal(off.api.prefersReducedMotion(), false);
  assert.equal(off.document.documentElement.getAttribute('data-motion'), 'full');

  const on = mount({ reducedMotion: true });
  assert.equal(on.api.prefersReducedMotion(), true);
  assert.equal(on.document.documentElement.getAttribute('data-motion'), 'reduced');

  // An explicit override wins in both directions.
  on.api.set('motion', 'full');
  assert.equal(on.api.prefersReducedMotion(), false);
  assert.equal(on.document.documentElement.getAttribute('data-motion'), 'full');

  off.api.set('motion', 'reduced');
  assert.equal(off.api.prefersReducedMotion(), true);
  assert.equal(off.document.documentElement.getAttribute('data-motion'), 'reduced');
});

/* ========================================================================== *
 * Formatter memoisation — the milestone's central performance change
 * ========================================================================== */

test('the memoised formatter is byte-identical to the original', () => {
  const { ctx, original } = mount();
  const memo = ctx.Game.settings.format;
  assert.ok(memo.__scMemo, 'the cache must be installed');

  const values = [0, 1, 7, 999, 1000, 999999, 1e6, 1234567, 1e9, 1.5e12,
    7.77e15, 1e21, 0.5, -1, -1e7, 12345.678];
  let checked = 0;
  for (const v of values) {
    for (const d of [undefined, 0, 1, 2]) {
      const a = String(original.call(ctx.Game.settings, v, d));
      const b = String(memo.call(ctx.Game.settings, v, d));
      assert.equal(b, a, `format(${v}, ${d})`);
      checked++;
    }
  }
  assert.ok(checked >= 60);
});

test('a repeated value is served from the cache, not recomputed', () => {
  const { ctx, api } = mount();
  /* Count where the work actually happens: the memo closes over the original
     `format`, so patching `__scOriginal` would intercept nothing and the
     assertion would pass vacuously. */
  const raw = ctx.Game.utils.formatters.shortName;
  let calls = 0;
  ctx.Game.utils.formatters.shortName = function () { calls++; return raw.apply(this, arguments); };

  const first = ctx.Game.settings.format(1234567);
  assert.equal(calls, 1, 'the first call computes exactly once');
  for (let i = 0; i < 50; i++) assert.equal(ctx.Game.settings.format(1234567), first);

  assert.equal(calls, 1, '50 repeats must not recompute');
  ctx.Game.utils.formatters.shortName = raw;
  assert.ok(api.formatterCacheStats().hits >= 50);
});

test('changing the number format cannot serve a stale string', () => {
  const { ctx } = mount();
  const short = ctx.Game.settings.format(1234567);

  ctx.Game.settings.entries.formatter = 'scientific';
  const scientific = ctx.Game.settings.format(1234567);
  assert.notEqual(scientific, short, 'the new formatter must take effect immediately');

  ctx.Game.settings.entries.formatter = 'shortName';
  assert.equal(ctx.Game.settings.format(1234567), short, 'switching back restores the original text');
});

test('non-finite input bypasses the cache and reaches the original unchanged', () => {
  const { ctx, api } = mount();
  const before = api.formatterCacheStats();
  ctx.Game.settings.format(NaN);
  const after = api.formatterCacheStats();

  assert.equal(after.bypass, before.bypass + 1);
  assert.equal(after.misses, before.misses, 'nothing non-numeric is cached');
});

test('the cache is bounded and never grows without limit', () => {
  const { ctx, api } = mount();
  for (let i = 0; i < 5000; i++) ctx.Game.settings.format(i * 7919);
  const stats = api.formatterCacheStats();
  assert.ok(stats.size <= 4096, 'size stayed within the cap, got ' + stats.size);
  assert.ok(stats.clears >= 1, 'the cap was actually exercised');
});

test('installing the cache twice does not double-wrap', () => {
  const { ctx, api } = mount();
  const first = ctx.Game.settings.format;
  assert.equal(api.installFormatterCache(), false);
  assert.equal(ctx.Game.settings.format, first);
  assert.equal(first.__scOriginal.__scMemo, undefined, 'the original is not itself a wrapper');
});

/* ========================================================================== *
 * Announcer
 * ========================================================================== */

test('nothing is announced during hydration', () => {
  const { api, document } = mount();
  assert.equal(api.isHydrated(), false);
  assert.equal(api.announce('Storage full'), false, 'hydration must stay silent');
  assert.equal(document.getElementById('sc-a11y-live').textContent, '');
});

test('a polite announcement reaches exactly one shared live region', () => {
  const { api, document } = mount();
  api.markHydrated();

  assert.equal(api.announce('Metal storage is full'), true);
  api.flushAnnouncements();

  const live = document.getElementById('sc-a11y-live');
  assert.equal(live.getAttribute('aria-live'), 'polite');
  assert.equal(live.getAttribute('role'), 'status');
  assert.equal(live.className, 'sc-visually-hidden');
  assert.equal(live.textContent, 'Metal storage is full');

  // Exactly one of each region, never a competing pair.
  assert.equal(document.body.byClass('sc-visually-hidden').length, 2);
});

test('identical repeats are dropped and bursts coalesce into one message', () => {
  const { api, document } = mount();
  api.markHydrated();

  api.announce('Energy deficit');
  api.flushAnnouncements();
  assert.equal(api.announce('Energy deficit'), false, 'an identical repeat is dropped');

  api.announce('Oil storage is full');
  api.announce('Metal storage is full');
  assert.equal(api.announce('Oil storage is full'), false, 'a duplicate inside the burst is dropped');
  api.flushAnnouncements();

  assert.equal(document.getElementById('sc-a11y-live').textContent,
    'Oil storage is full. Metal storage is full');
});

test('assertive messages use the alert region, not the polite one', () => {
  const { api, document } = mount();
  api.markHydrated();
  api.announce('Import failed', 'assertive');

  const alert = document.getElementById('sc-a11y-alert');
  assert.equal(alert.getAttribute('aria-live'), 'assertive');
  assert.equal(alert.getAttribute('role'), 'alert');
  assert.equal(alert.textContent, 'Import failed');
  assert.equal(document.getElementById('sc-a11y-live').textContent, '');
});

test('announcement preferences gate normal chatter but never errors', () => {
  const { api, document } = mount({ storage: makeStorage({ 'sc.ui.announcements': 'reduced' }) });
  api.markHydrated();

  assert.equal(api.announce('Tier 3 Science is affordable'), false, 'reduced drops routine news');
  assert.equal(api.announce('Save failed', 'assertive'), true, 'failures still get through');

  const off = mount({ storage: makeStorage({ 'sc.ui.announcements': 'off' }) });
  off.api.markHydrated();
  assert.equal(off.api.announce('Save failed', 'assertive'), false, 'off means off');
  assert.equal(off.document.getElementById('sc-a11y-alert').textContent, '');
});

/* ========================================================================== *
 * Source-level guarantees
 * ========================================================================== */

test('the runtime never touches the save or canonical gameplay state', () => {
  const body = stripComments(readFileSync(join(ROOT, 'ui/modern/uiRuntime.js'), 'utf8'));

  for (const forbidden of [
    /getItem\s*\(\s*['"]save['"]/, /setItem\s*\(\s*['"]save['"]/, /removeItem\s*\(\s*['"]save['"]/,
    /\bGame\s*\.\s*save\s*\(/, /legacyLoad/, /\bpurchaseTech\s*\(/, /\bexplore\s*\(\s*['"]/,
    /\bsetInterval\s*\(/, /requestAnimationFrame/, /MutationObserver/,
    /\bresourcesUnlocked\b/, /\btabsUnlocked\b/, /\bexplored\s*\.\s*push/
  ]) {
    assert.ok(!forbidden.test(body), 'uiRuntime.js must not contain ' + forbidden);
  }

  // The only storage it may reach is its own namespace.
  const keys = body.match(/NS \+ [a-zA-Z]+/g) || [];
  assert.ok(keys.length > 0, 'preferences are namespaced');
});

test('index.html loads the runtime and makes no third-party font request', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');

  assert.ok(html.includes('ui/modern/uiRuntime.js'));

  // A <link>/<script>/@import to a font host would be a runtime request; a
  // comment explaining the removal is not.
  const tags = html.match(/<(?:link|script|style)\b[^>]*>/gi) || [];
  for (const tag of tags) {
    assert.ok(!/fonts\.(?:googleapis|gstatic)\.com/i.test(tag),
      'a remote font request came back: ' + tag);
  }
  assert.ok(!/@import[^;]*fonts\.(?:googleapis|gstatic)/i.test(html));
});

test('no stylesheet fetches a remote font', () => {
  for (const file of ['styles/modern/tokens.css', 'styles/modern/base.css',
    'styles/modern/shell.css', 'styles/modern/components.css']) {
    const css = readFileSync(join(ROOT, file), 'utf8');
    assert.ok(!/@import\s+url\(\s*['"]?https?:/i.test(css), file + ' imports a remote stylesheet');
    assert.ok(!/src\s*:\s*url\(\s*['"]?https?:/i.test(css), file + ' fetches a remote font');
  }
});

test('the display font resolves from a local stack', () => {
  const tokens = readFileSync(join(ROOT, 'styles/modern/tokens.css'), 'utf8');
  const decl = tokens.match(/--sc-font-display:[^;]+;/s);
  assert.ok(decl, 'the display token still exists');
  assert.ok(/Orbitron/.test(decl[0]), 'Orbitron is still preferred when locally installed');
  assert.ok(/var\(--sc-font-ui\)/.test(decl[0]), 'and it degrades to the UI stack');
});
