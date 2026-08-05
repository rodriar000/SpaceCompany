/*
 * M3 — research command center (the view over the technology graph).
 *
 * The fixture loads the REAL `tech.js` and the REAL `science.js` (so
 * `purchaseTech` / `buyTech` / `getCost` are the shipped implementations) into a
 * vm with a mini-DOM. Only the boundaries the view must not own — statistics,
 * the refresh functions, the notification helpers — are stubbed, and they are
 * stubbed as COUNTERS so "the canonical side effects happened exactly once" is
 * a real assertion rather than an inspection of our own code.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadFiles, ROOT } from './helpers/loadLegacy.mjs';
import { createDocument, element } from './helpers/miniDom.mjs';

const list = (value) => Array.from(value);

/**
 * Build a page containing the research pane and the legacy tech table, then run
 * the shipped scripts against it.
 *
 * @param {object} options
 * @param {string} options.search           query string, e.g. '?research=legacy'
 * @param {number} options.science          starting science
 * @param {boolean} options.legacyButtons   include the legacy purchase buttons
 */
function mount({ search = '', science = 0, legacyButtons = true } = {}) {
  const document = createDocument();

  const pane = element('div', { id: 'technologiesTab' });
  const container = element('div', { className: 'container' });
  const techTable = element('table', { id: 'techTable' });
  container.appendChild(techTable);
  document.body.appendChild(pane);
  document.body.appendChild(container);

  const calls = {
    refreshResources: 0,
    refreshResearches: 0,
    refreshTabs: 0,
    newUnlock: [],
    notify: [],
    statistics: {}
  };

  const Game = {
    ui: {},
    uiComponents: [],
    // The legacy table renderer. `Game.tech.initialise()` drives it; the modern
    // view must never talk to it, which is part of what these tests check.
    techUI: { initialise() {}, addTech() {}, replaceTech() {}, removeTech() {} },
    settings: { format: (value) => String(value) },
    statistics: {
      add(id, value) { calls.statistics[id] = (calls.statistics[id] || 0) + value; }
    },
    notifySuccess: (title, text) => calls.notify.push([title, text])
  };

  const ctx = loadFiles(
    [
      'constants.js',
      'data/techData.js',
      'tech.js',                          // real buyTech / gainTech / apply
      'science.js',                       // real purchaseTech / getCost
      'ui/modern/techGraph.js',
      'ui/modern/techCommandCenter.js'
    ],
    {
      Game,
      document,
      science: 0,
      resourcesUnlocked: [],
      tabsUnlocked: [],
      noBorder: [],
      location: { search },
      // Boundaries the view must not own, stubbed as counters.
      refreshResources: () => { calls.refreshResources++; },
      refreshResearches: () => { calls.refreshResearches++; },
      refreshTabs: () => { calls.refreshTabs++; },
      newUnlock: (tab) => { calls.newUnlock.push(tab); }
    }
  );

  ctx.Game.tech.initialise();
  ctx.science = science;

  if (legacyButtons) {
    for (const id of Object.keys(ctx.Game.techData)) {
      const row = element('tr', { id });
      const button = element('button', { id: id + 'Button' });
      button.onclick = () => ctx.purchaseTech(id);
      row.appendChild(button);
      techTable.appendChild(row);
    }
  }

  const research = ctx.window.SpaceCompanyResearch;
  if (research.isGraph) research.component.initialise();

  return { ctx, document, pane, techTable, calls, research };
}

/** All technology node elements currently in the pane. */
function nodes(pane) {
  return pane.byClass('sc-tech-node');
}

function nodeFor(document, id) {
  return document.getElementById('scTech-' + id);
}

function buyButton(document, id) {
  const box = nodeFor(document, id);
  return box && box.byClass('sc-tech-node__buy')[0];
}

function selectButton(document, id) {
  const box = nodeFor(document, id);
  return box && box.byClass('sc-tech-node__select')[0];
}

/* ========================================================================== *
 * Construction and idempotency
 * ========================================================================== */

test('renders one node per technology, with unique ids and no duplicates', () => {
  const { pane, document, ctx } = mount();

  const boxes = nodes(pane);
  assert.equal(boxes.length, 33);

  const ids = boxes.map((box) => box.getAttribute('data-tech'));
  assert.equal(new Set(ids).size, 33, 'a technology was rendered twice');
  assert.deepEqual(ids.slice().sort(), Object.keys(ctx.Game.techData).sort());

  for (const id of ids) assert.ok(nodeFor(document, id), id + ' has no element');

  // Reading order is stage by stage, which is also the pathway-mode order.
  const stages = pane.byClass('sc-tech__stage')
    .map((section) => Number(section.getAttribute('data-depth')));
  assert.deepEqual(stages, [0, 1, 2, 3, 4, 5, 6]);
});

test('initialising repeatedly builds exactly once', () => {
  const { pane, research } = mount();
  const before = pane.descendants().length;
  const listeners = pane.byClass('sc-tech')[0].listeners.click.length;

  for (let i = 0; i < 10; i++) research.component.initialise();

  assert.equal(pane.descendants().length, before, 'the DOM grew on re-initialise');
  assert.equal(nodes(pane).length, 33);
  assert.equal(pane.byClass('sc-tech')[0].listeners.click.length, listeners,
    'a click listener was bound twice');
});

test('repeated updates never create or destroy an element', () => {
  const { pane, research, ctx } = mount({ science: 10 });
  const before = pane.descendants().length;

  for (let i = 0; i < 50; i++) {
    ctx.science = i * 1000;                 // churn affordability every tick
    research.component.update();
  }

  assert.equal(pane.descendants().length, before);
  assert.equal(nodes(pane).length, 33);
});

test('the whole map uses one delegated click listener, not one per node', () => {
  const { pane } = mount();
  let bound = 0;
  for (const el of pane.descendants()) {
    if (el.listeners && el.listeners.click) bound += el.listeners.click.length;
  }
  assert.equal(bound, 1, 'expected a single delegated listener');
});

test('connectors are rendered, decorative, and anchored on real nodes', () => {
  const { pane, document } = mount();

  const edges = pane.byClass('sc-tech__edge');
  const heads = pane.byClass('sc-tech__edge-head');
  assert.equal(edges.length, 23);
  assert.equal(heads.length, 23, 'every connector carries a direction arrow');

  for (const edge of edges) {
    assert.ok(nodeFor(document, edge.getAttribute('data-from')), 'connector start is a real node');
    assert.ok(nodeFor(document, edge.getAttribute('data-to')), 'connector end is a real node');
  }

  const wires = pane.byClass('sc-tech__wires')[0];
  assert.equal(wires.getAttribute('aria-hidden'), 'true', 'connectors must be decorative');
});

/* ========================================================================== *
 * Visibility in the rendered DOM
 * ========================================================================== */

test('a concealed node renders no name, no cost, and no reachable control', () => {
  const { document, ctx } = mount();

  for (const [id, tech] of Object.entries(ctx.Game.techData)) {
    if (tech.unlocked || tech.current > 0) continue;
    const box = nodeFor(document, id);
    const text = box.textContent;

    assert.ok(text.includes('Undiscovered'), id + ' should read as undiscovered');
    assert.ok(!text.includes(tech.name), id + ' leaked its name into the DOM');
    assert.ok(!text.includes(String(tech.cost.science)), id + ' leaked its cost into the DOM');

    assert.equal(selectButton(document, id).getAttribute('aria-hidden'), 'true');
    assert.equal(selectButton(document, id).getAttribute('tabindex'), '-1');
    assert.equal(buyButton(document, id).disabled, true);
  }
});

test('a revealed node shows its canonical name, type and cost', () => {
  const { document } = mount({ science: 1000 });
  const box = nodeFor(document, 'unlockStorage');

  assert.ok(box.textContent.includes('Storage Upgrades'));
  assert.ok(box.textContent.includes('Unlock'));
  assert.ok(box.textContent.includes('5'), 'the canonical cost should be shown');
  assert.equal(selectButton(document, 'unlockStorage').getAttribute('tabindex'), '0');
});

test('an unaffordable technology keeps its control disabled but visible', () => {
  const { document } = mount({ science: 0 });
  const button = buyButton(document, 'unlockStorage');

  assert.equal(button.disabled, true);
  assert.equal(button.getAttribute('aria-disabled'), 'true');
  assert.equal(button.getAttribute('aria-hidden'), 'false', 'still discoverable, just blocked');
  assert.ok(nodeFor(document, 'unlockStorage').className.includes('sc-state-blocked'));
});

/* ========================================================================== *
 * The canonical purchase boundary
 * ========================================================================== */

test('researching runs the canonical path exactly once and spends the canonical cost', () => {
  const { document, ctx, calls, research } = mount({ science: 100 });

  buyButton(document, 'unlockStorage').click();

  assert.equal(ctx.science, 95, 'exactly one canonical cost was deducted');
  assert.equal(ctx.Game.tech.getTechData('unlockStorage').current, 1);
  assert.equal(calls.statistics.techResearched, 1, 'the purchase fired exactly once');
  assert.equal(calls.refreshResources, 1);
  assert.equal(calls.refreshResearches, 1);
  assert.equal(calls.refreshTabs, 1);
  assert.deepEqual(list(calls.newUnlock), ['resources'], 'the canonical tab alert fired once');

  // And the canonical unlock side effect really happened.
  assert.equal(ctx.Game.tech.isUnlocked('unlockOil'), true);
  assert.equal(research.getGraph().byId.unlockStorage.state, 'researched');
});

test('the click is delegated to the legacy purchase button', () => {
  const { document, ctx } = mount({ science: 100 });
  let legacyClicks = 0;
  const legacy = document.getElementById('unlockStorageButton');
  const original = legacy.onclick;
  legacy.onclick = (event) => { legacyClicks++; return original(event); };

  buyButton(document, 'unlockStorage').click();

  assert.equal(legacyClicks, 1, 'the legacy handler must be the one that runs');
  assert.equal(ctx.science, 95);
});

test('without a legacy button it falls back to purchaseTech, still exactly once', () => {
  const { document, ctx, calls } = mount({ science: 100, legacyButtons: false });

  buyButton(document, 'unlockStorage').click();

  assert.equal(ctx.science, 95);
  assert.equal(calls.statistics.techResearched, 1);
  assert.equal(ctx.Game.tech.getTechData('unlockStorage').current, 1);
});

test('an unaffordable technology cannot be researched by clicking anyway', () => {
  const { document, ctx, calls } = mount({ science: 1 });

  buyButton(document, 'unlockStorage').click();

  assert.equal(ctx.science, 1, 'nothing was spent');
  assert.equal(ctx.Game.tech.getTechData('unlockStorage').current, 0);
  assert.equal(calls.statistics.techResearched, undefined);
});

test('clicking a completed one-shot again does nothing', () => {
  const { document, ctx, calls, research } = mount({ science: 1000 });

  buyButton(document, 'unlockStorage').click();
  const after = ctx.science;
  assert.equal(calls.statistics.techResearched, 1);

  buyButton(document, 'unlockStorage').click();
  buyButton(document, 'unlockStorage').click();

  assert.equal(ctx.science, after, 'a finished technology can never be bought again');
  assert.equal(calls.statistics.techResearched, 1);
  assert.equal(ctx.Game.tech.getTechData('unlockStorage').current, 1);
  assert.equal(research.getGraph().byId.unlockStorage.actionable, false);
});

test('a repeatable technology charges the canonical escalating price per click', () => {
  const { document, ctx, calls } = mount({ science: 1e9 });
  ctx.Game.tech.unlockTech('efficiencyResearch');
  ctx.window.SpaceCompanyResearch.component.update();

  const base = ctx.Game.techData.efficiencyResearch.cost.science;
  let expected = ctx.science;

  buyButton(document, 'efficiencyResearch').click();
  expected -= base;
  assert.equal(ctx.science, expected);
  assert.equal(ctx.Game.tech.getTechData('efficiencyResearch').current, 1);

  buyButton(document, 'efficiencyResearch').click();
  expected -= ctx.getCost(base, 1);
  assert.equal(ctx.science, expected, 'the second level uses the canonical getCost curve');
  assert.equal(ctx.Game.tech.getTechData('efficiencyResearch').current, 2);
  assert.equal(calls.statistics.techResearched, 2);
});

test('a purchase reveals successors and updates the map immediately', () => {
  const { document, research } = mount({ science: 1000 });

  assert.equal(research.getGraph().byId.unlockOil.visibility, 'preview');
  assert.ok(nodeFor(document, 'unlockOil').textContent.includes('Undiscovered'));

  buyButton(document, 'unlockStorage').click();

  assert.equal(research.getGraph().byId.unlockOil.visibility, 'visible');
  const revealed = nodeFor(document, 'unlockOil');
  assert.ok(revealed.textContent.includes('Oil Processing'), 'the successor is now named');
  assert.ok(revealed.className.includes('sc-is-revealed'));
});

test('the view source never spends science or applies an effect itself', () => {
  const source = readFileSync(join(ROOT, 'ui/modern/techCommandCenter.js'), 'utf8');
  const body = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  for (const forbidden of [
    /\bscience\s*-=/, /\bwindow\s*\.\s*science\s*=[^=]/,
    /\bbuyTech\s*\(/, /\bgainTech\s*\(/, /\bspendResources\s*\(/,
    /\bunlockTech\s*\(/, /\bonApply\s*\(/, /\.\s*apply\s*\(\s*\w/,
    /\bGame\s*\.\s*tech\s*\.\s*entries/,
    /localStorage/,
    /\b(?:resourcesUnlocked|tabsUnlocked|researched|available)\s*(?:\.\s*(?:push|splice)|=[^=]|\[)/
  ]) {
    assert.ok(!forbidden.test(body), 'techCommandCenter.js must not contain ' + forbidden);
  }

  // It must reach the canonical path, and only through these two doors.
  assert.equal((body.match(/window\.purchaseTech\s*\(/g) || []).length, 1,
    'exactly one call site for the canonical purchase function');
  assert.ok(/getElementById\(id \+ 'Button'\)/.test(body), 'delegates to the legacy button');
});

/* ========================================================================== *
 * Selection is presentation only
 * ========================================================================== */

test('selecting a technology changes presentation and nothing else', () => {
  const { document, ctx, research, calls } = mount({ science: 1000 });
  const before = snapshot(ctx);

  selectButton(document, 'unlockStorage').click();

  assert.equal(research.getSelection(), 'unlockStorage');
  assert.ok(nodeFor(document, 'unlockStorage').className.includes('sc-is-selected'));
  assert.equal(selectButton(document, 'unlockStorage').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(snapshot(ctx), before, 'selection changed gameplay state');
  assert.equal(calls.statistics.techResearched, undefined, 'selection must not purchase');

  // Deselecting is equally inert.
  selectButton(document, 'unlockStorage').click();
  assert.equal(research.getSelection(), null);
  assert.deepEqual(snapshot(ctx), before);
});

test('the inspector agrees with the selected node', () => {
  const { document, research } = mount({ science: 1000 });
  research.select('unlockBasicEnergy');

  const panel = document.getElementById('scTechPanel');
  assert.ok(!panel.className.includes('sc-is-collapsed'), 'the panel should be open');
  assert.ok(panel.textContent.includes('Basic Energy Production'));
  assert.ok(panel.textContent.includes('20'), 'the canonical cost is shown');
  assert.ok(panel.textContent.includes('Ready to research'));

  const node = nodeFor(document, 'unlockBasicEnergy');
  assert.ok(node.textContent.includes('Basic Energy Production'));
  assert.ok(node.className.includes('sc-is-selected'));
});

test('the inspector reports the shortfall when science is short', () => {
  const { document, research } = mount({ science: 3 });
  research.select('unlockStorage');

  const panel = document.getElementById('scTechPanel');
  assert.ok(panel.textContent.includes('Not enough science'));
  assert.ok(document.getElementById('scTechFactMissing').textContent.includes('2'),
    'missing = cost 5 - held 3');
});

test('an undiscovered technology cannot be selected into the inspector', () => {
  const { document, research } = mount();
  research.select('unlockBatteriesT4');

  const panel = document.getElementById('scTechPanel');
  assert.ok(panel.className.includes('sc-is-collapsed'));
  assert.ok(!panel.textContent.includes('Tier 4 Batteries'));
});

test('the inspector reports external unlocks honestly instead of inventing a parent', () => {
  const { ctx, document, research } = mount({ science: 1e9 });
  ctx.Game.tech.unlockTech('unlockPSU');
  research.component.update();
  research.select('unlockPSU');

  const panel = document.getElementById('scTechPanel');
  assert.ok(panel.textContent.includes('No technology prerequisite'));
  assert.ok(panel.textContent.includes('core.js'));
});

/* ========================================================================== *
 * Header, frontier readout and legend
 * ========================================================================== */

test('the header counts match the projection', () => {
  const { document, research } = mount({ science: 25 });
  const stats = research.getGraph().stats;

  assert.equal(document.getElementById('scTechResearched').textContent,
    stats.completed + ' / ' + stats.oneShot);
  assert.equal(document.getElementById('scTechAvailable').textContent, String(stats.available));
  assert.equal(document.getElementById('scTechAffordable').textContent, String(stats.affordable));
  assert.equal(document.getElementById('scTechScience').textContent, '25');
  assert.equal(stats.affordable, 2, 'both starting technologies are affordable at 25 science');
});

test('the frontier readout lists affordable technologies cheapest first', () => {
  const { document } = mount({ science: 25 });
  const items = document.getElementById('scTechInspectorEmpty')
    .byClass('sc-tech__frontier')[0].getElementsByTagName('li')
    .filter((li) => !li.className.includes('sc-is-collapsed'))
    .map((li) => li.textContent);

  assert.deepEqual(items, [
    'Storage Upgrades — 5 science',
    'Basic Energy Production — 20 science'
  ]);
});

test('the legend is collapsed by default and toggles accessibly', () => {
  const { document } = mount();
  const legend = document.getElementById('scTechLegend');
  const toggle = document.getElementById('scTechLegendToggle');

  assert.ok(legend.className.includes('sc-is-collapsed'));
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(toggle.getAttribute('aria-controls'), 'scTechLegend');

  toggle.click();
  assert.ok(!legend.className.includes('sc-is-collapsed'));
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
});

test('every state carries a word, not colour alone', () => {
  const { document, ctx } = mount({ science: 1e9 });
  ctx.Game.tech.unlockTech('energyEfficiencyResearch');
  ctx.window.SpaceCompanyResearch.component.update();

  const words = ['Ready to research', 'Undiscovered'];
  const text = document.getElementById('scTechCenter').textContent;
  for (const word of words) assert.ok(text.includes(word), 'missing state word: ' + word);

  const levelled = nodeFor(document, 'energyEfficiencyResearch');
  assert.ok(levelled.textContent.includes('Level 0 / 25'), 'levelled progress must be spelled out');
});

/* ========================================================================== *
 * Fallbacks
 * ========================================================================== */

test('?research=legacy leaves the legacy table alone and builds no map', () => {
  const { pane, document, research } = mount({ search: '?research=legacy', science: 1000 });

  assert.equal(research.mode, 'legacy');
  assert.equal(research.isGraph, false);
  assert.equal(document.getElementById('scTechCenter'), null);
  assert.equal(nodes(pane).length, 0);
  // The legacy purchase controls are the only ones present.
  assert.equal(document.getElementById('techTable').getElementsByTagName('button').length, 33);
});

test('?ui=legacy also restores the legacy research table', () => {
  const { document, research } = mount({ search: '?ui=legacy', science: 1000 });
  assert.equal(research.mode, 'legacy');
  assert.equal(document.getElementById('scTechCenter'), null);
});

test('a query that merely mentions research does not trigger the fallback', () => {
  const { research } = mount({ search: '?research=graph&ui=modern' });
  assert.equal(research.mode, 'graph');
  assert.equal(research.isGraph, true);
});

test('in map mode the legacy purchase buttons stay in the document as the fallback', () => {
  const { document } = mount({ science: 1000 });

  // Hidden by CSS, never removed — solCenter.js and refreshResearches() write
  // to these rows without null guards.
  assert.equal(document.getElementById('techTable').getElementsByTagName('button').length, 33);
  assert.ok(document.getElementById('unlockStorageButton'));
});

test('neither the view nor the graph touches localStorage', () => {
  for (const file of ['ui/modern/techGraph.js', 'ui/modern/techCommandCenter.js']) {
    const body = stripComments(readFileSync(join(ROOT, file), 'utf8'));
    assert.ok(!/localStorage/.test(body), file + ' must never touch storage');
    assert.ok(!/sessionStorage/.test(body), file + ' must never touch storage');
  }
});

/* ========================================================================== *
 * DOM-contract protection
 * ========================================================================== */

test('the research stylesheet never overrides the legacy .hidden contract', () => {
  const css = stripComments(readFileSync(join(ROOT, 'styles/modern/research.css'), 'utf8'));

  const hiddenRules = css.split('}')
    .filter((rule) => /\.hidden\b/.test((rule.split('{')[0] || '')));
  assert.deepEqual(hiddenRules, [],
    'research.css must not include .hidden in any selector — Bootstrap owns it');
});

test('the legacy table is hidden only while the map is really in the DOM', () => {
  const css = readFileSync(join(ROOT, 'styles/modern/research.css'), 'utf8');
  assert.ok(
    css.includes('#scTechCenter ~ .container #techTable'),
    'the sibling combinator is load-bearing: it is what makes the fallback structural'
  );
});

test('index.html wires the research view without adding trackers', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');

  assert.ok(html.includes('ui/modern/techGraph.js'));
  assert.ok(html.includes('ui/modern/techCommandCenter.js'));
  assert.ok(html.includes('styles/modern/research.css'));
  assert.ok(html.includes("data-research"), 'the mode must be resolved before stylesheets');

  // M1 removed the analytics/Kongregate SCRIPTS. The Kongregate credit link in
  // the help pane is ordinary markup and is expected to stay.
  const scripts = html.match(/<script\b[^>]*>/gi) || [];
  for (const tag of scripts) {
    assert.ok(!/google-analytics|googletagmanager|kongregate/i.test(tag),
      'a tracker script came back: ' + tag);
  }
});

/** Comments describe the rules; only executable text may be checked against them. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Everything the view is forbidden to change. */
function snapshot(ctx) {
  const tech = {};
  for (const [id, entry] of Object.entries(ctx.Game.tech.entries)) {
    tech[id] = { current: entry.current, unlocked: entry.unlocked };
  }
  return JSON.stringify({
    tech,
    science: ctx.science,
    resourcesUnlocked: list(ctx.resourcesUnlocked),
    tabsUnlocked: list(ctx.tabsUnlocked)
  });
}
