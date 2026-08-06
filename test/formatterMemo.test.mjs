/*
 * M5a — formatter memoisation: dependency proof, parity corpus and cache safety.
 *
 * Everything here runs the REAL `utils.js` formatters and the REAL
 * `Game.settings.format` from `settings.js` through the REAL memo, so parity is
 * a property of the shipped code.
 *
 * NOTE ON Infinity: the inherited `formatEveryThirdPower` never terminates for
 * a non-finite magnitude —
 *     while (Math.round(value) >= 1000) value /= 1000;   // Infinity/1000 === Infinity
 * — so no test here may call the ORIGINAL formatter with Infinity. The memo's
 * contract is that it does not change that behaviour, which is asserted by
 * checking the routing decision rather than by executing the hang.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadFiles, ROOT } from './helpers/loadLegacy.mjs';
import { createDocument } from './helpers/miniDom.mjs';

const FORMATTERS = ['raw', 'rounded', 'name', 'shortName', 'shortName2', 'scientific', 'scientific2'];

function makeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get length() { return map.size; },
    key(i) { return Array.from(map.keys())[i] ?? null; },
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
    _map: map
  };
}

/** Real utils.js + real settings.js + the real memo. */
function mount() {
  const document = createDocument();
  const jq = () => ({ change() {}, val() { return ''; }, addClass() {}, removeClass() {}, length: 0 });
  const ctx = loadFiles(
    ['utils.js', 'settings.js', 'ui/modern/uiRuntime.js'],
    {
      Game: { ui: {}, uiComponents: [], utils: null },
      document, localStorage: makeStorage(),
      matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
      location: { search: '' },
      navigator: { language: 'en-US' },
      StrLoc: (s) => s,
      $: Object.assign(jq, { fn: {}, extend: Object.assign })
    }
  );
  const settings = ctx.Game.settings;
  const original = settings.format.__scOriginal || settings.format;
  ctx.window.SpaceCompanyUI.installFormatterCache();
  return { ctx, settings, api: ctx.window.SpaceCompanyUI, original: ctx.Game.settings.format.__scOriginal };
}

/** Deterministic PRNG so the corpus is reproducible. Seed is reported. */
const SEED = 0x5EEDC0DE;
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
}

/** A deterministic corpus of finite values spanning 22+ orders of magnitude. */
function corpus() {
  const values = [];
  // Suffix / order boundaries and the values immediately around them.
  for (let e = 0; e <= 24; e++) {
    const base = Math.pow(10, e);
    values.push(base, base - 1, base + 1, base * 0.999, base * 1.001, base / 2, base * 9.999);
  }
  // Rounding boundaries the formatter is sensitive to.
  for (const v of [0.5, 1.5, 2.5, 999.4, 999.5, 999.6, 1000.4, 1000.5,
    999999.4, 999999.5, 1e6 - 0.5, 1e6 + 0.5, 1234.5678, 0.0001, 0.001, 0.01]) values.push(v);
  // Small integers and zero.
  for (let i = 0; i <= 64; i++) values.push(i);
  values.push(0, -0);
  // Deterministic pseudo-random sweep.
  const rand = rng(SEED);
  for (let i = 0; i < 4000; i++) {
    values.push(rand() * Math.pow(10, Math.floor(rand() * 23)));
  }
  // Negative equivalents of everything finite so far.
  const negatives = values.filter((v) => v > 0).map((v) => -v);
  return values.concat(negatives).filter((v) => isFinite(v));
}

/* ========================================================================== *
 * A — dependency audit, proven from source
 * ========================================================================== */

test('the formatter depends only on value, digits and the formatter setting', () => {
  const utils = readFileSync(join(ROOT, 'utils.js'), 'utf8');
  const settings = readFileSync(join(ROOT, 'settings.js'), 'utf8');

  // `Game.settings.format` reads exactly one setting.
  const body = settings.match(/instance\.format\s*=\s*function[\s\S]*?\n {4}\};/)[0];
  assert.match(body, /this\.entries\.formatter/);
  const reads = body.match(/this\.entries\.\w+/g) || [];
  assert.deepEqual([...new Set(reads)], ['this.entries.formatter'],
    'format() must read no other setting; update the cache key if this changes');

  // The decimal separator is frozen at load time (IIFE), not a live setting.
  assert.match(utils, /instance\.decimalSeparator\s*=\s*function\s*\(\)\s*\{[\s\S]*?\}\(\);/,
    'decimalSeparator must stay an immutable load-time constant');

  // Suffix tables are captured in closures when `formatters` is built.
  assert.match(utils, /instance\.formatters\s*=\s*\{/);
  assert.ok(!/formatters\[[^\]]+\]\s*=/.test(utils.replace(/instance\.formatters\s*=\s*\{[\s\S]*?\};/, '')),
    'no formatter is reassigned at runtime');
});

test('the cache key contains every mutable dependency', () => {
  const src = readFileSync(join(ROOT, 'ui/modern/uiRuntime.js'), 'utf8');
  const key = src.match(/var key = [^;]+;/)[0];
  assert.match(key, /entries\s*&&\s*this\.entries\.formatter/, 'formatter setting is in the key');
  assert.match(key, /digit/, 'digit count is in the key');
  assert.match(key, /value/, 'the numeric value is in the key');
});

test('every shipped formatter round-trips through the memo identically', () => {
  const { ctx, settings, original } = mount();
  const values = [0, 1, 999, 1000, 1e6, 1234567, 1e9, 1e15, 1e21, 0.5, -1, -1e7, 12345.678];

  assert.deepEqual(Object.keys(ctx.Game.utils.formatters), FORMATTERS);

  let checked = 0;
  for (const f of FORMATTERS) {
    settings.entries.formatter = f;
    for (const v of values) {
      for (const d of [undefined, 0, 1, 2]) {
        assert.equal(String(settings.format(v, d)), String(original.call(settings, v, d)),
          `${f}(${v}, ${d})`);
        checked++;
      }
    }
  }
  assert.ok(checked >= 300, 'checked ' + checked);
});

/* ========================================================================== *
 * B — cache safety
 * ========================================================================== */

test('switching formatter, and switching back, never serves a stale string', () => {
  const { settings, original } = mount();
  const seen = {};

  // Prime every formatter with the same value.
  for (const f of FORMATTERS) {
    settings.entries.formatter = f;
    seen[f] = settings.format(1234567);
  }
  // Revisit them in a different order; each must still be its own text.
  for (const f of [...FORMATTERS].reverse()) {
    settings.entries.formatter = f;
    assert.equal(settings.format(1234567), seen[f], 'revisiting ' + f);
    assert.equal(settings.format(1234567), String(original.call(settings, 1234567)));
  }
  // And the outputs are genuinely distinct, so the test could actually fail.
  assert.ok(new Set(Object.values(seen)).size >= 4, 'formatters produce different text');
});

test('a formatter change from loading a save takes effect without function replacement', () => {
  const { settings, original } = mount();
  const before = settings.format(1234567);
  const fn = settings.format;

  // This is exactly what `Game.settings.load` does: mutate entries in place.
  settings.entries.formatter = 'scientific';

  assert.equal(settings.format, fn, 'the function object is unchanged');
  assert.equal(settings.format(1234567), String(original.call(settings, 1234567)));
  assert.notEqual(settings.format(1234567), before);
});

test('positive and negative zero share a key only because output is identical', () => {
  const { settings, original } = mount();
  for (const f of FORMATTERS) {
    settings.entries.formatter = f;
    assert.equal(String(original.call(settings, 0)), String(original.call(settings, -0)),
      f + ': -0 and +0 must format identically for the shared key to be safe');
    assert.equal(settings.format(-0), settings.format(0));
  }
});

test('distinct numeric inputs never collide through stringification', () => {
  const { settings } = mount();
  const seen = new Map();
  const probes = [1, 1.0, 1e21, 1e-7, 0.1, 0.2, 0.30000000000000004,
    123456789012345680, 123456789012345690, 1e300, -1e300];
  for (const v of probes) {
    // The key the memo builds for this value, reproduced exactly.
    const key = settings.entries.formatter + ' 0 ' + v;
    if (seen.has(key)) {
      assert.equal(seen.get(key), v, 'two different numbers produced the same key: ' + key);
    }
    seen.set(key, v);
  }
  // And formatting stays correct for every probe.
  for (const v of probes) assert.equal(typeof settings.format(v), 'string');
});

test('non-finite input is routed to the original and never cached', () => {
  const { settings, api } = mount();
  const before = api.formatterCacheStats();

  // NaN is safe to execute (the original returns "NaN"); Infinity is NOT,
  // because the inherited formatter loops forever. Assert the ROUTING instead.
  settings.format(NaN);
  const after = api.formatterCacheStats();
  assert.equal(after.bypass, before.bypass + 1);
  assert.equal(after.misses, before.misses, 'nothing non-finite enters the cache');

  const src = readFileSync(join(ROOT, 'ui/modern/uiRuntime.js'), 'utf8');
  const guard = src.match(/if \(typeof value !== 'number' \|\| !isFinite\(value\)\) \{[\s\S]*?\}/)[0];
  assert.match(guard, /stats\.bypass\+\+/);
  assert.match(guard, /return original\.call\(this, value, digit\)/,
    'non-finite input must reach the ORIGINAL unchanged — the inherited Infinity hang is preserved, not introduced');
});

test('the cache is capacity-bounded and evicted values recompute correctly', () => {
  const { settings, api, original } = mount();

  for (let i = 0; i < 12000; i++) settings.format(i * 7919 + 0.5);

  const stats = api.formatterCacheStats();
  assert.ok(stats.size <= 4096, 'size stayed within the cap, got ' + stats.size);
  assert.ok(stats.clears >= 2, 'eviction actually happened, clears=' + stats.clears);

  // Values evicted long ago must still format correctly.
  for (const v of [0.5, 7919.5, 79190.5, 791900.5]) {
    assert.equal(settings.format(v), String(original.call(settings, v)), 'after eviction: ' + v);
  }
});

test('worst-case unique input stays bounded and correct', () => {
  const { settings, api, original } = mount();
  const rand = rng(0xC0FFEE);
  let mismatches = 0;
  for (let i = 0; i < 6000; i++) {
    const v = rand() * 1e12;
    if (settings.format(v) !== String(original.call(settings, v))) mismatches++;
  }
  assert.equal(mismatches, 0);
  assert.ok(api.formatterCacheStats().size <= 4096);
});

/* ========================================================================== *
 * C — the large deterministic parity corpus
 * ========================================================================== */

test('parity across a deterministic 10k+ corpus, every formatter', () => {
  const { settings, original, api } = mount();
  const values = corpus();
  assert.ok(values.length >= 4500, 'corpus size ' + values.length);

  let checked = 0;
  let firstMismatch = null;
  for (const f of FORMATTERS) {
    settings.entries.formatter = f;
    for (const v of values) {
      const memo = String(settings.format(v));
      const raw = String(original.call(settings, v));
      if (memo !== raw && !firstMismatch) firstMismatch = { formatter: f, value: v, memo, raw };
      checked++;
    }
  }

  assert.equal(firstMismatch, null, 'first mismatch: ' + JSON.stringify(firstMismatch));
  assert.ok(checked >= 30000, 'checked ' + checked + ' cases across ' + FORMATTERS.length + ' formatters');
  assert.ok(api.formatterCacheStats().size <= 4096);
});

test('a stable value is served from cache; a changing value still recomputes', () => {
  const { ctx, settings, api } = mount();
  /* The memo closes over the original `format`, so the only honest place to
     count real computations is the formatter it ultimately calls. */
  const raw = ctx.Game.utils.formatters.shortName;
  let calls = 0;
  ctx.Game.utils.formatters.shortName = function () { calls++; return raw.apply(this, arguments); };
  settings.entries.formatter = 'shortName';

  for (let i = 0; i < 200; i++) settings.format(42424242);
  assert.equal(calls, 1, 'a stable value costs exactly one computation');

  calls = 0;
  // A disjoint range, so none of these can already be in the cache.
  for (let i = 0; i < 200; i++) settings.format(50000000 + i);
  assert.equal(calls, 200, 'a continuously changing value is never wrongly cached');

  ctx.Game.utils.formatters.shortName = raw;
  assert.ok(api.formatterCacheStats().hits > 0);
});
