/*
 * Save-safety characterization: legacySave / legacyLoad (saving.js).
 *
 * These functions are the heart of save compatibility. `legacySave` snapshots
 * ~180 global `var`s into a plain object; `legacyLoad` restores them, tolerating
 * missing keys and honouring backward-compatibility aliases. Any regression here
 * risks corrupting or silently dropping player progress, so these are the most
 * important tests in the suite.
 *
 * See docs/SAVE_COMPATIBILITY.md for the full invariant list.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFiles } from './helpers/loadLegacy.mjs';

/** Fresh sandbox with the legacy globals + save/load functions. */
function fresh() {
  return loadFiles(['variable.js', 'saving.js']);
}

test('legacySave includes the version stamp and merges caller data', () => {
  const g = fresh();
  const data = g.legacySave({ lastFixedUpdate: 1234567890 });
  assert.equal(data.versionNumber, 'V0.5.1.2 Beta');
  // Caller-provided fields survive the merge ($.extend(defaults, data)).
  assert.equal(data.lastFixedUpdate, 1234567890);
});

test('legacySave captures representative resource + producer state', () => {
  const g = fresh();
  g.metal = 4242;
  g.solarPanel = 7;
  g.researchUnlocked = true;
  g.researched = ['energy1', 'metal1'];

  const data = g.legacySave({});
  assert.equal(data.metal, 4242);
  assert.equal(data.solarPanel, 7);
  assert.equal(data.researchUnlocked, true);
  assert.deepEqual(data.researched, ['energy1', 'metal1']);
});

test('save -> load round-trip restores mutated globals', () => {
  const source = fresh();
  source.metal = 999;
  source.energy = 12345;
  source.solarPanel = 3;
  source.rocketLaunched = true;
  source.tabsUnlocked = ['energy', 'science'];
  const snapshot = JSON.parse(JSON.stringify(source.legacySave({})));

  // Load the snapshot into a pristine sandbox and confirm state transfers.
  const target = fresh();
  assert.equal(target.metal, 0, 'precondition: target starts fresh');
  target.legacyLoad(snapshot);

  assert.equal(target.metal, 999);
  assert.equal(target.energy, 12345);
  assert.equal(target.solarPanel, 3);
  assert.equal(target.rocketLaunched, true);
  assert.deepEqual(target.tabsUnlocked, ['energy', 'science']);
});

test('schema preservation: missing keys keep their defaults, unknown keys are ignored', () => {
  const g = fresh();
  const before = g.metal; // default 0
  g.legacyLoad({ energy: 500, someFutureKey: 'ignored' });

  assert.equal(g.energy, 500, 'known key applied');
  assert.equal(g.metal, before, 'absent key untouched (kept default)');
  assert.equal('someFutureKey' in g, false, 'unknown key not adopted as global');
});

test('backward-compatibility alias: spaceMetal maps onto lunarite', () => {
  const g = fresh();
  // Legacy saves stored lunarite under the old name "spaceMetal".
  g.legacyLoad({ spaceMetal: 777, spaceMetalStorage: 800, spaceMetalNextStorage: 1600 });
  assert.equal(g.lunarite, 777);
  assert.equal(g.lunariteStorage, 800);
  assert.equal(g.lunariteNextStorage, 1600);
});

test('legacyLoad tolerates null/empty without throwing', () => {
  const g = fresh();
  assert.doesNotThrow(() => g.legacyLoad(null));
  assert.doesNotThrow(() => g.legacyLoad(undefined));
  assert.doesNotThrow(() => g.legacyLoad({}));
  assert.equal(g.metal, 0);
});

test('the persisted key set is stable (guards accidental schema drift)', () => {
  const g = fresh();
  const keys = Object.keys(g.legacySave({}));
  // A representative, load-bearing subset that must always be present.
  for (const required of ['versionNumber', 'companyName', 'energy', 'metal',
    'uranium', 'science', 'researched', 'tabsUnlocked', 'resourcesUnlocked',
    'rocketLaunched', 'dyson', 'antimatter']) {
    assert.ok(keys.includes(required), `save schema must include "${required}"`);
  }
});
