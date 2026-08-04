/*
 * Characterization: initial game state, storage caps, and unlock defaults.
 * Source of truth is variable.js (the top-level global `var` declarations that
 * seed a brand-new game). Locking these guards against accidental changes to
 * starting resources, storage capacity and progression gates.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFiles } from './helpers/loadLegacy.mjs';

const g = loadFiles(['variable.js']);

test('metadata defaults', () => {
  assert.equal(g.versionNumber, 'V0.5.1.2 Beta');
  assert.equal(g.companyName, 'Space');
});

test('primary resources start empty', () => {
  for (const r of ['energy', 'plasma', 'uranium', 'lava', 'oil', 'metal', 'gem',
    'charcoal', 'wood', 'silicon', 'lunarite', 'methane', 'titanium', 'gold',
    'silver', 'hydrogen', 'helium', 'ice', 'meteorite', 'science']) {
    assert.equal(g[r], 0, `${r} should start at 0`);
  }
});

test('per-second accumulators start at 0', () => {
  assert.equal(g.energyps, 0);
  assert.equal(g.uraniumps, 0);
  assert.equal(g.plasmaps, 0);
});

test('storage caps have their documented starting values', () => {
  // Representative caps: changing these silently would alter early-game balance.
  assert.equal(g.uraniumStorage, 50);
  assert.equal(g.uraniumNextStorage, 100);
  assert.equal(g.oilStorage, 50);
  assert.equal(g.oilNextStorage, 100);
  assert.equal(g.metalStorage, 50);
  assert.equal(g.metalNextStorage, 100);
});

test('unlock / progression gates start locked', () => {
  assert.equal(g.researchUnlocked, false);
  assert.equal(g.techUnlocked, false);
  assert.equal(g.meteoriteUnlocked, false);
  assert.equal(g.rocketLaunched, false);
});

test('progression collections start empty', () => {
  for (const key of ['researched', 'available', 'explored', 'tabsUnlocked',
    'resourcesUnlocked', 'activated', 'buttonsHidden']) {
    assert.ok(Array.isArray(g[key]), `${key} should be an array`);
    assert.equal(g[key].length, 0, `${key} should start empty`);
  }
});

test('no producers are pre-built', () => {
  for (const b of ['charcoalEngine', 'solarPanel', 'battery', 'miner',
    'woodcutter', 'lab', 'rocket']) {
    assert.equal(g[b], 0, `${b} should start at 0`);
  }
});
