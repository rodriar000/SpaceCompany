/*
 * Characterization: cost constants & affordability (balance-regression guard).
 *
 * The legacy economy encodes producer costs as top-level global `var`s in
 * variable.js (e.g. `batteryMetalCost`). Affordability in the UI is a direct
 * comparison of a resource against these constants. Pinning representative
 * costs here makes any accidental balance change fail loudly, and exercises a
 * representative "can I afford / purchase this?" decision without needing the
 * DOM.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFiles } from './helpers/loadLegacy.mjs';

const g = loadFiles(['variable.js']);

/** Legacy affordability semantics: you can buy when you hold >= each cost. */
function canAfford(resources, costs) {
  return Object.entries(costs).every(([res, cost]) => resources[res] >= cost);
}

test('representative early producer costs are unchanged', () => {
  // Solar panel (first energy producer)
  assert.equal(g.solarPanelMetalCost, 30);
  assert.equal(g.solarPanelGemCost, 35);
  assert.equal(g.solarPanelOutput, 1.5);

  // Charcoal engine
  assert.equal(g.charcoalEngineMetalCost, 50);
  assert.equal(g.charcoalEngineGemCost, 25);

  // Tier-1 battery (storage upgrade)
  assert.equal(g.batteryMetalCost, 50000);
  assert.equal(g.batteryGemCost, 50000);
  assert.equal(g.batteryLunariteCost, 30000);
});

test('affordability check for a representative purchase (solar panel)', () => {
  const cost = { metal: g.solarPanelMetalCost, gem: g.solarPanelGemCost };

  // Not enough of either resource -> cannot afford.
  assert.equal(canAfford({ metal: 0, gem: 0 }, cost), false);
  assert.equal(canAfford({ metal: 30, gem: 0 }, cost), false);

  // Exactly meeting cost -> affordable (legacy uses >=).
  assert.equal(canAfford({ metal: 30, gem: 35 }, cost), true);
  assert.equal(canAfford({ metal: 100, gem: 100 }, cost), true);
});

test('a purchase deducts exactly the listed cost (arithmetic invariant)', () => {
  // Mirrors the legacy "spend then increment count" pattern.
  let metal = 100, gem = 100, solarPanel = g.solarPanel;
  const beforeMetal = metal, beforeGem = gem;

  metal -= g.solarPanelMetalCost;
  gem -= g.solarPanelGemCost;
  solarPanel += 1;

  assert.equal(metal, beforeMetal - 30);
  assert.equal(gem, beforeGem - 35);
  assert.equal(solarPanel, 1);
});
