/*
 * M3 — canonical technology graph projection.
 *
 * These tests run the REAL `data/techData.js` through the REAL
 * `ui/modern/techGraph.js` inside a vm context, so every assertion is about the
 * shipped data and the shipped adapter — not a fixture that could drift.
 *
 * The property under test throughout is that the projection is a *lens*: it
 * must report what `newTechs` / `unlocked` / `current` actually say, must never
 * write to them, and must never leak a technology the player has not reached.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadFiles, ROOT } from './helpers/loadLegacy.mjs';

/**
 * `assert.deepEqual` compares prototypes, and anything built inside the vm
 * carries that realm's `Array.prototype`. Normalising through the host realm
 * keeps the assertions about VALUES, which is what these tests care about.
 */
const list = (value) => Array.from(value);

/** A context with the real tech data and the real graph adapter loaded. */
function makeGraph({ science = 0, entries = null } = {}) {
  const ctx = loadFiles(
    ['constants.js', 'data/techData.js', 'ui/modern/techGraph.js'],
    { Game: {}, science }
  );
  if (entries) {
    // Emulate `Game.tech.entries` (copies of techData carrying live state).
    const live = {};
    for (const id of Object.keys(ctx.Game.techData)) {
      live[id] = Object.assign({}, ctx.Game.techData[id], entries[id] || {});
    }
    ctx.Game.tech = { entries: live };
  }
  return { ctx, api: ctx.window.SpaceCompanyTechGraph };
}

/* ========================================================================== *
 * Enumeration and edge derivation
 * ========================================================================== */

test('projects exactly the shipped technologies, in canonical order', () => {
  const { ctx, api } = makeGraph();
  const graph = api.build();
  const canonical = Object.keys(ctx.Game.techData);

  assert.equal(graph.nodes.length, 33, 'technology count changed — update the M3 contract');
  assert.deepEqual(list(graph.nodes).map((n) => n.id), canonical);
  assert.equal(Object.keys(graph.byId).length, 33);
});

test('graph construction is deterministic across builds', () => {
  const { api } = makeGraph();
  const shape = () => JSON.stringify(api.build().nodes.map((n) => [
    n.id, n.depth, n.lane, n.col, n.row, n.x, n.y, n.state, n.visibility
  ]));
  assert.equal(shape(), shape());
  assert.equal(shape(), shape());
});

test('every edge is derived from a real newTechs entry, and none is invented', () => {
  const { ctx, api } = makeGraph();
  const graph = api.build();

  const expected = [];
  for (const [id, tech] of Object.entries(ctx.Game.techData)) {
    for (const child of tech.newTechs) expected.push(id + '->' + child);
  }
  const actual = list(graph.edges).map((e) => e.from + '->' + e.to);

  assert.equal(actual.length, 23);
  assert.deepEqual(actual.sort(), expected.slice().sort());
});

test('prerequisites are the exact reverse of newTechs', () => {
  const { ctx, api } = makeGraph();
  const graph = api.build();

  for (const node of graph.nodes) {
    for (const childId of node.children) {
      assert.ok(
        graph.byId[childId].prerequisites.includes(node.id),
        `${childId} should list ${node.id} as a prerequisite`
      );
    }
    for (const parentId of node.prerequisites) {
      assert.ok(ctx.Game.techData[parentId].newTechs.includes(node.id));
    }
  }
});

test('roots, terminals and orphans match the shipped data', () => {
  const { api } = makeGraph();
  const graph = api.build();

  assert.deepEqual(list(graph.roots), [
    'unlockStorage', 'unlockBasicEnergy', 'unlockPlasma', 'unlockPSU',
    'unlockEmc', 'unlockDyson', 'efficiencyResearch', 'scienceEfficiencyResearch',
    'energyEfficiencyResearch', 'batteryEfficiencyResearch'
  ]);
  assert.equal(graph.terminals.length, 15);
  assert.ok(list(graph.terminals).includes('unlockBatteriesT4'));
  assert.deepEqual(list(graph.diagnostics.orphans), [
    'efficiencyResearch', 'scienceEfficiencyResearch',
    'energyEfficiencyResearch', 'batteryEfficiencyResearch'
  ]);
});

test('technologies unlocked from outside newTechs are marked, not given fake edges', () => {
  const { api } = makeGraph();
  const graph = api.build();

  // unlockPSU is unlocked by core.js once Plasma T1 is bought, but nothing
  // lists it in newTechs — it must stay parentless and be flagged instead.
  const psu = graph.byId.unlockPSU;
  assert.deepEqual(list(psu.prerequisites), []);
  assert.equal(psu.externalUnlock, true);
  assert.match(psu.externalUnlockNote, /core\.js/);

  for (const id of ['unlockPlasma', 'unlockEmc', 'unlockDyson']) {
    assert.equal(graph.byId[id].externalUnlock, true);
    assert.match(graph.byId[id].externalUnlockNote, /solCenter\.js/);
  }
});

test('the documented external-unlock sites still exist in the source', () => {
  const solCenter = readFileSync(join(ROOT, 'solCenter.js'), 'utf8');
  const core = readFileSync(join(ROOT, 'core.js'), 'utf8');
  const science = readFileSync(join(ROOT, 'science.js'), 'utf8');

  for (const id of ['unlockPlasma', 'unlockEmc', 'unlockDyson']) {
    assert.ok(solCenter.includes(`Game.tech.unlockTech("${id}")`), `${id} unlock moved`);
  }
  assert.ok(core.includes("Game.tech.unlockTech('unlockPSU')"), 'unlockPSU unlock moved');
  // The four efficiency researches are revealed by a science threshold.
  assert.match(science, /tech\.unlocked = true;/);
});

test('no duplicate edges and no missing references', () => {
  const { api } = makeGraph();
  const graph = api.build();
  assert.deepEqual(list(graph.diagnostics.duplicateEdges), []);
  assert.deepEqual(list(graph.diagnostics.missingReferences), []);

  const seen = new Set();
  for (const edge of graph.edges) {
    const key = edge.from + '->' + edge.to;
    assert.ok(!seen.has(key), 'duplicate edge ' + key);
    seen.add(key);
  }
});

test('the shipped data is acyclic', () => {
  const { api } = makeGraph();
  assert.deepEqual(list(api.build().diagnostics.cycles), []);
});

/* ========================================================================== *
 * Robustness against data that does not exist today
 * ========================================================================== */

test('a cycle introduced later is reported, not recursed into forever', () => {
  const { ctx, api } = makeGraph();
  // unlockOil is a leaf today; point it back at its own grandparent.
  ctx.Game.techData.unlockOil.newTechs = ['unlockStorage'];

  const graph = api.build();               // must terminate
  assert.ok(graph.diagnostics.cycles.length > 0, 'cycle should be reported');
  assert.ok(list(graph.nodes).every((n) => Number.isFinite(n.depth)));
  assert.ok(list(graph.nodes).every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)));
});

test('a dangling newTechs reference is reported and dropped, not rendered', () => {
  const { ctx, api } = makeGraph();
  ctx.Game.techData.unlockOil.newTechs = ['thisTechDoesNotExist'];

  const graph = api.build();
  assert.deepEqual(list(graph.diagnostics.missingReferences), ['unlockOil->thisTechDoesNotExist']);
  assert.equal(graph.byId.thisTechDoesNotExist, undefined);
  assert.deepEqual(list(graph.byId.unlockOil.children), []);
  assert.ok(list(graph.edges).every((e) => e.to !== 'thisTechDoesNotExist'));
});

test('a technology with more than one prerequisite keeps both', () => {
  const { ctx, api } = makeGraph();
  ctx.Game.techData.unlockStorage.newTechs = ['unlockOil', 'unlockSolar'];

  const graph = api.build();
  assert.deepEqual(list(graph.byId.unlockSolar.prerequisites).sort(),
    ['unlockBasicEnergy', 'unlockStorage']);
});

/* ========================================================================== *
 * Visibility and the spoiler policy
 * ========================================================================== */

test('a fresh game shows only the two canonically unlocked technologies', () => {
  const { api } = makeGraph();
  const graph = api.build();

  const visible = list(graph.nodes).filter((n) => n.visibility === 'visible').map((n) => n.id);
  assert.deepEqual(visible, ['unlockStorage', 'unlockBasicEnergy']);

  // Their direct successors are previews; everything else is undiscovered.
  const preview = list(graph.nodes).filter((n) => n.visibility === 'preview').map((n) => n.id);
  assert.deepEqual(preview.sort(),
    ['unlockMachines', 'unlockOil', 'unlockSolar', 'upgradeEngineTech']);
  assert.equal(list(graph.nodes).filter((n) => n.visibility === 'undiscovered').length, 27);
});

test('undiscovered and preview technologies conceal name, cost, effects and level', () => {
  const { api } = makeGraph();
  const graph = api.build();

  const hidden = list(graph.nodes).filter((n) => n.visibility !== 'visible');
  assert.equal(hidden.length, 31);
  for (const node of hidden) {
    assert.equal(node.publicName, 'Undiscovered', node.id + ' leaked its name');
    assert.equal(node.publicCost, null, node.id + ' leaked its cost');
    assert.equal(node.publicCostText, '—');
    assert.deepEqual(list(node.publicEffects), [], node.id + ' leaked its effects');
    assert.equal(node.publicLevel, null);
    assert.equal(node.actionable, false);
    // The real name must not appear in any public field.
    assert.ok(!JSON.stringify([node.publicName, node.publicDesc, node.publicCostText])
      .includes(node.name), node.id + ' leaked its name into a public field');
  }
});

test('purchasing a technology reveals exactly its canonical successors', () => {
  const { api } = makeGraph({
    entries: { unlockStorage: { current: 1, unlocked: true }, unlockOil: { unlocked: true } }
  });
  const graph = api.build();

  assert.equal(graph.byId.unlockStorage.visibility, 'visible');
  assert.equal(graph.byId.unlockOil.visibility, 'visible');
  // Nothing beyond the canonical unlock became visible.
  assert.equal(graph.byId.unlockDestruction.visibility, 'undiscovered');
});

test('completed one-time research stays visible as history', () => {
  const { api } = makeGraph({
    entries: { unlockStorage: { current: 1, unlocked: true } }
  });
  const node = api.build().byId.unlockStorage;

  assert.equal(node.visibility, 'visible');
  assert.equal(node.state, 'researched');
  assert.equal(node.publicName, 'Storage Upgrades');
  assert.equal(node.actionable, false, 'a finished one-shot offers no action');
});

/* ========================================================================== *
 * States, levels and affordability
 * ========================================================================== */

test('available + affordable reads ready; available + broke reads blocked', () => {
  const rich = makeGraph({ science: 1000 }).api.build().byId.unlockStorage;
  assert.equal(rich.state, 'ready');
  assert.equal(rich.affordable, true);
  assert.equal(rich.actionable, true);
  assert.equal(rich.missing, 0);

  const poor = makeGraph({ science: 2 }).api.build().byId.unlockStorage;
  assert.equal(poor.state, 'blocked');
  assert.equal(poor.affordable, false);
  assert.equal(poor.actionable, true, 'still actionable — just not affordable');
  assert.equal(poor.missing, 3);
});

test('an infinite (maxLevel -1) technology never maxes out', () => {
  const { api } = makeGraph({
    science: 1e12,
    entries: { efficiencyResearch: { unlocked: true, current: 7 } }
  });
  const node = api.build().byId.efficiencyResearch;

  assert.equal(node.maxLevel, -1);
  assert.equal(node.repeatable, true);
  assert.equal(node.type, 'repeatable');
  assert.equal(node.buyable, true);
  assert.equal(node.state, 'progressing');
  assert.equal(node.publicLevel, 'Level 7');
  // Cost follows the canonical curve, not the base price.
  assert.equal(node.cost, Math.floor(100000 * Math.pow(1.1, 7)));
});

test('a finite multi-level technology reports progress then maxes out', () => {
  const mid = makeGraph({
    science: 1e12,
    entries: { energyEfficiencyResearch: { unlocked: true, current: 10 } }
  }).api.build().byId.energyEfficiencyResearch;

  assert.equal(mid.maxLevel, 25);
  assert.equal(mid.levelled, true);
  assert.equal(mid.publicLevel, 'Level 10 / 25');
  assert.equal(mid.state, 'progressing');
  assert.equal(mid.actionable, true);

  const done = makeGraph({
    science: 1e12,
    entries: { energyEfficiencyResearch: { unlocked: true, current: 25 } }
  }).api.build().byId.energyEfficiencyResearch;

  // NOTE: `Game.tech.isMaxLevel` deliberately reports false for this one id.
  // Purchasability must follow `buyTech`, which refuses at maxLevel.
  assert.equal(done.buyable, false);
  assert.equal(done.state, 'maxed');
  assert.equal(done.actionable, false);
  assert.equal(done.publicCost, null);
});

test('cost is the canonical number and the canonical formatting', () => {
  const { ctx, api } = makeGraph({ science: 0 });
  let formatted = null;
  ctx.Game.settings = { format: (value) => { formatted = value; return 'FORMATTED'; } };

  const node = api.build().byId.unlockBatteries;
  assert.equal(node.cost, 15000, 'numeric cost must come from techData, unformatted');
  assert.equal(node.costText, 'FORMATTED');
  assert.equal(typeof formatted, 'number', 'the formatter must receive a number');
  assert.equal(typeof node.cost, 'number');
});

test('the next-level price mirrors buyTech: base cost first, then the getCost curve', () => {
  const first = makeGraph({
    entries: { efficiencyResearch: { unlocked: true, current: 0 } }
  }).api.build().byId.efficiencyResearch;
  assert.equal(first.cost, 100000, 'an unbought technology uses its predefined base cost');

  const second = makeGraph({
    entries: { efficiencyResearch: { unlocked: true, current: 1 } }
  }).api.build().byId.efficiencyResearch;
  assert.equal(second.cost, Math.floor(100000 * Math.pow(1.1, 1)));
});

/* ========================================================================== *
 * Read-only guarantees
 * ========================================================================== */

test('building the graph writes nothing back to the canonical data', () => {
  const { ctx, api } = makeGraph({ science: 1e9 });
  const before = JSON.stringify(ctx.Game.techData, (key, value) =>
    typeof value === 'function' ? '[fn]' : value);
  const scienceBefore = ctx.science;

  api.build();
  api.build();

  assert.equal(
    JSON.stringify(ctx.Game.techData, (k, v) => (typeof v === 'function' ? '[fn]' : v)),
    before
  );
  assert.equal(ctx.science, scienceBefore);
});

test('the adapter source contains no gameplay writes', () => {
  const source = readFileSync(join(ROOT, 'ui/modern/techGraph.js'), 'utf8');
  const body = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  // Targets that belong to the game, as opposed to the projection's own nodes.
  for (const forbidden of [
    /\bpurchaseTech\s*\(/, /\bbuyTech\s*\(/, /\bgainTech\s*\(/,
    /\bunlockTech\s*\(/, /\bonApply\s*\(/, /\bapply\s*\(\s*\w/,
    /localStorage/,
    /\bentry\s*\.\s*(unlocked|current|cost|maxLevel)\s*=[^=]/,
    /\bentries\s*\[[^\]]*\]\s*\.\s*\w+\s*=[^=]/,
    /\bGame\s*\.[\w.]+\s*=[^=]/,
    /\bwindow\s*\.\s*science\s*=[^=]/, /\bscience\s*-=/,
    // The legacy arrays, in their WRITE forms only — `'researched'` is also a
    // presentation state name in this file, which is not a gameplay write.
    /\b(?:resourcesUnlocked|tabsUnlocked|researched|available)\s*(?:\.\s*(?:push|splice|pop|shift)|=[^=]|\[)/
  ]) {
    assert.ok(!forbidden.test(body), 'techGraph.js must not contain ' + forbidden);
  }
});

test('the structure signature moves only when unlock or level state moves', () => {
  const base = makeGraph({ science: 0 });
  const first = base.api.structureSignature();
  base.ctx.science = 999999;                       // affordability only
  assert.equal(base.api.structureSignature(), first, 'science must not churn the signature');

  base.ctx.Game.techData.unlockOil.unlocked = true;
  assert.notEqual(base.api.structureSignature(), first);
});

/* ========================================================================== *
 * Layout
 * ========================================================================== */

test('layout assigns every node a unique cell and column equals depth', () => {
  const { api } = makeGraph();
  const graph = api.build();
  const cells = new Map();

  for (const node of graph.nodes) {
    const key = node.col + ':' + node.row;
    assert.ok(!cells.has(key), `cell ${key} shared by ${cells.get(key)} and ${node.id}`);
    cells.set(key, node.id);
    if (!node.packed) {
      assert.equal(node.col, node.depth, node.id + ' column must encode topological depth');
    } else {
      assert.equal(node.depth, 0, 'only depth-0 nodes may be packed');
    }
  }
});

test('standalone research is packed into its own band', () => {
  const { api } = makeGraph();
  const graph = api.build();
  const packed = list(graph.nodes).filter((n) => n.packed).map((n) => n.id);

  assert.deepEqual(packed, [
    'efficiencyResearch', 'scienceEfficiencyResearch',
    'energyEfficiencyResearch', 'batteryEfficiencyResearch'
  ]);
  // All on one row, side by side — the reason the band exists.
  const rows = new Set(list(graph.nodes).filter((n) => n.packed).map((n) => n.row));
  assert.equal(rows.size, 1);

  const band = list(graph.layout.bands).find((b) => b.key === 'standalone');
  assert.ok(band, 'the standalone band must exist');
});

test('node boxes never overlap', () => {
  const { api } = makeGraph();
  const nodes = api.build().nodes;

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w &&
                      a.y < b.y + b.h && b.y < a.y + a.h;
      assert.ok(!overlap, `${a.id} overlaps ${b.id}`);
    }
  }
});

test('every connector starts on its parent and ends on its child', () => {
  const { api } = makeGraph();
  const graph = api.build();

  assert.equal(graph.connectors.length, graph.edges.length);
  assert.equal(graph.connectors.length, 23);

  for (const connector of graph.connectors) {
    const from = graph.byId[connector.from];
    const to = graph.byId[connector.to];
    assert.ok(from && to, 'a connector must join two real nodes');
    assert.equal(connector.x1, from.x + from.w, 'starts at the parent right edge');
    assert.equal(connector.y1, from.y + from.h / 2);
    assert.equal(connector.x2, to.x, 'ends at the child left edge');
    assert.equal(connector.y2, to.y + to.h / 2);
    assert.match(connector.path, /^M[\d.]+ [\d.]+ H[-\d.]+ V[\d.]+ H[\d.]+$/);
    assert.ok(connector.head.length > 0, 'a connector carries a direction arrow');
    // Progression always flows forward.
    assert.ok(to.col > from.col, `${connector.from} -> ${connector.to} must move rightwards`);
  }
});

test('the canvas contains every node', () => {
  const { api } = makeGraph();
  const graph = api.build();

  for (const node of graph.nodes) {
    assert.ok(node.x >= 0 && node.x + node.w <= graph.layout.canvas.width, node.id + ' x');
    assert.ok(node.y >= 0 && node.y + node.h <= graph.layout.canvas.height, node.id + ' y');
  }
});

/* ========================================================================== *
 * Progression summary
 * ========================================================================== */

test('the progression denominator counts one-shot technologies only', () => {
  const { api } = makeGraph();
  const stats = api.build().stats;

  assert.equal(stats.total, 33);
  assert.equal(stats.oneShot, 29, 'the 4 levelled/repeatable upgrades are excluded');
  assert.equal(stats.completed, 0);
  assert.equal(stats.percent, 0);
  assert.equal(stats.available, 2);
  assert.equal(stats.affordable, 0);
});

test('progression reaches 100% when every one-shot technology is bought', () => {
  const entries = {};
  const { ctx } = makeGraph();
  for (const [id, tech] of Object.entries(ctx.Game.techData)) {
    if (tech.maxLevel === 1) entries[id] = { current: 1, unlocked: true };
  }
  const stats = makeGraph({ science: 1e15, entries }).api.build().stats;

  assert.equal(stats.completed, 29);
  assert.equal(stats.percent, 100);
  assert.equal(stats.undiscovered, 4, 'the repeatables stay undiscovered until revealed');
});

/* ========================================================================== *
 * Presentation-only taxonomy
 * ========================================================================== */

test('lane assignment is presentation-only and total', () => {
  const { api } = makeGraph();
  const graph = api.build();
  const keys = new Set(list(api.LANES).map((l) => l.key));

  for (const node of graph.nodes) {
    assert.ok(keys.has(node.lane), node.id + ' has an unknown lane');
  }
  // A lane must never be derivable from, or feed back into, gameplay fields.
  const source = readFileSync(join(ROOT, 'ui/modern/techGraph.js'), 'utf8');
  assert.ok(!/LANE_OF\[[^\]]+\]\s*=/.test(source), 'LANE_OF must not be written at runtime');
});

test('an unmapped technology falls back to a lane instead of vanishing', () => {
  const { ctx, api } = makeGraph();
  ctx.Game.techData.brandNewTech = Object.assign({}, ctx.Game.techData.unlockOil, {
    name: 'Brand New', newTechs: []
  });

  const graph = api.build();
  assert.equal(graph.nodes.length, 34);
  assert.equal(graph.byId.brandNewTech.lane, 'standalone',
    'an orphan packs into the standalone band whatever LANE_OF says');
  assert.equal(graph.byId.brandNewTech.packed, true);
});
