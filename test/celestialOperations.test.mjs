/*
 * M4 — celestial operations projection and command center.
 *
 * The fixture builds the legacy solar-system DOM the game actually ships and
 * runs the REAL `solarSystem.js` against it, so `explore()` is the shipped
 * implementation. Only the boundaries the view must not own — statistics, the
 * refresh functions, the notification helpers — are stubbed, and they are
 * stubbed as COUNTERS, which is what turns "the canonical side effects happened
 * exactly once" into a real assertion rather than self-inspection.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadFiles, ROOT } from './helpers/loadLegacy.mjs';
import { createDocument, element } from './helpers/miniDom.mjs';

const list = (value) => Array.from(value);
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** The destinations and fuel costs the shipped pane publishes. */
const BODIES = [
  ['spaceRocket', null, null],
  ['moon', 'Moon', 20],
  ['mercury', null, null],
  ['venus', 'Venus', 50],
  ['mars', 'Mars', 80],
  ['asteroidBelt', 'AsteroidBelt', 200],
  ['wonderStation', 'WonderStation', 500],
  ['jupiter', 'Jupiter', 1000],
  ['saturn', 'Saturn', 2000],
  ['uranus', null, null],
  ['neptune', null, null],
  ['pluto', 'Pluto', 5000],
  ['kuiperBelt', 'KuiperBelt', 6000],
  ['solCenter', 'SolCenter', 7000]
];

function mount({ search = '', fuel = 0, unlocked = [], explored = [], launched = false,
                 stars = 0, starRange = 0, starRocket = false } = {}) {
  const document = createDocument();
  const pane = element('div', { id: 'solarSystem' });
  const navBox = element('div', { className: 'container' });
  const nav = element('table');
  navBox.appendChild(nav);
  pane.appendChild(navBox);
  document.body.appendChild(pane);

  const content = element('div', { className: 'tab-content' });
  pane.appendChild(content);

  const calls = { refreshResources: 0, newUnlock: [], notify: [], statistics: {} };

  for (const [id, action, cost] of BODIES) {
    const row = element('tr', { id, className: unlocked.includes(id) ? 'inner' : 'hidden' });
    nav.appendChild(row);
    if (!action) continue;

    const exploreRow = element('tr', { id: 'explore' + action });
    const button = element('button');
    exploreRow.appendChild(button);
    const span = element('span', { id: id + 'RocketFuelCost', text: String(cost) });
    exploreRow.appendChild(span);
    content.appendChild(exploreRow);
  }

  /* Elements `explore()` writes to without a null guard. */
  for (const id of ['collapseInnerPlanet', 'methanePower', 'wonderStation', 'collapseOuter',
    'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'kuiperBelt', 'wonderTab',
    'collapseOuterPlanet', 'fusionPower', 'solCenter', 'solCenterTopTab',
    'lunariteNav', 'methaneNav', 'titaniumNav', 'siliconNav', 'goldNav', 'silverNav',
    'hydrogenNav', 'heliumNav', 'iceNav']) {
    if (!document.getElementById(id)) document.body.appendChild(element('div', { id }));
  }

  const starEntries = {};
  for (let i = 0; i < stars; i++) {
    const id = '_' + (100 + i);
    const distance = 4 + i * 2;
    starEntries[id] = {
      id, name: 'System ' + i, distance, planets: 1,
      faction: 'Faction ' + i, factionId: 'f' + i,
      explored: false, owned: false
    };
    const visible = distance <= starRange;
    document.body.appendChild(element('tr', { id: 'star_' + id, className: visible ? '' : 'hidden' }));
    const control = element('div', { id: 'star_' + id + '_explore' });
    document.body.appendChild(control);
    document.body.appendChild(element('span', { id: 'star_' + id + 'Cost', text: String(distance * 10000) }));
  }

  const Game = {
    ui: {}, uiComponents: [],
    settings: { format: (v) => String(v) },
    statistics: { add(id, v) { calls.statistics[id] = (calls.statistics[id] || 0) + (v || 1); } },
    notifySuccess: (t, x) => calls.notify.push([t, x]),
    resources: { takeResource(res, amount) { ctxRef.rocketFuel -= amount; } },
    resourceData: {
      lunarite: { category: 'innerSol' }, methane: { category: 'innerSol' },
      titanium: { category: 'innerSol' }, silicon: { category: 'innerSol' },
      gold: { category: 'outerSol' }, silver: { category: 'outerSol' },
      hydrogen: { category: 'outerSol' }, helium: { category: 'outerSol' },
      ice: { category: 'outerSol' }
    },
    interstellar: {
      stars: { entries: starEntries, exploreSystem() { /* replaced below */ } },
      comms: { entries: { IRS: { count: starRange }, astroBreakthrough: { count: 0 } } },
      rocket: { entries: { tier1Rocket: { built: starRocket } } }
    }
  };

  let ctxRef = null;
  const ctx = loadFiles(
    ['constants.js', 'solarSystem.js', 'ui/modern/celestialModel.js', 'ui/modern/celestialCommandCenter.js'],
    {
      Game, document,
      location: { search },
      rocketFuel: fuel,
      rocketLaunched: launched,
      explored: explored.slice(),
      buttonsHidden: [], resourcesUnlocked: [], tabsUnlocked: [], antimatter: 0,
      getResource: () => ctx.rocketFuel,
      RESOURCE: { RocketFuel: 'rocketFuel' },
      refreshResources: () => { calls.refreshResources++; },
      newUnlock: (tab) => { calls.newUnlock.push(tab); }
    }
  );
  ctxRef = ctx;

  /* Wire the legacy explore buttons exactly as index.html does. */
  for (const [, action] of BODIES) {
    if (!action) continue;
    const row = document.getElementById('explore' + action);
    row.getElementsByTagName('button')[0].onclick = () => ctx.explore(action);
  }
  /* And the canonical star control. */
  for (const id of Object.keys(starEntries)) {
    document.getElementById('star_' + id + '_explore').onclick = () => {
      calls.statistics.starExplored = (calls.statistics.starExplored || 0) + 1;
      starEntries[id].explored = true;
    };
  }

  const api = ctx.window.SpaceCompanyCelestial;
  if (api.isMap) api.component.initialise();
  return { ctx, document, pane, calls, api, starEntries };
}

const nodeEl = (document, key) => document.getElementById('scCel-' + key.replace(':', '-'));
const selectBtn = (document, key) => {
  const el = nodeEl(document, key);
  return el && el.byClass(key.startsWith('star') ? 'sc-cel-star__select' : 'sc-cel-node__select')[0];
};

/* ========================================================================== *
 * Model membership, identity and validation
 * ========================================================================== */

test('projects every shipped solar destination with stable identities', () => {
  const { api, document } = mount({ unlocked: ['moon'] });
  const model = api.getModel();

  assert.equal(model.solar.length, 14);
  assert.deepEqual(list(model.solar).map((n) => n.id), BODIES.map((b) => b[0]));
  for (const node of model.solar) {
    assert.equal(node.domId, 'scCel-solar-' + node.id);
    assert.ok(nodeEl(document, 'solar:' + node.id), node.id + ' has no element');
  }
});

test('the destination registry matches what solarSystem.js actually does', () => {
  const source = readFileSync(join(ROOT, 'solarSystem.js'), 'utf8');
  const { api } = mount({});
  const model = api.getModel();

  /* Every explorable destination must exist in the canonical `planetsData`. */
  for (const node of model.solar) {
    if (!node.actionTarget) continue;
    assert.ok(new RegExp('\\b' + node.actionTarget + ':\\s*\\{').test(source),
      node.actionTarget + ' is no longer in planetsData');
  }
  /* And every canonical entry must be modelled — no destination may be dropped. */
  const canonical = (source.match(/^\s{2}\t*(\w+):\s*\{fuel:/gm) || [])
    .map((m) => m.trim().split(':')[0]);
  const modelled = list(model.solar).map((n) => n.actionTarget).filter(Boolean);
  for (const id of canonical) {
    assert.ok(modelled.includes(id), id + ' exists in planetsData but is not modelled');
  }

  /* Survey-only bodies are a documented canonical gap, not an omission. */
  assert.deepEqual(list(model.solar).filter((n) => n.surveyOnly).map((n) => n.id),
    ['mercury', 'uranus', 'neptune']);
  for (const id of ['Mercury', 'Uranus', 'Neptune']) {
    assert.ok(!new RegExp('\\b' + id + ':\\s*\\{fuel').test(source),
      id + ' gained an explore action — the survey-only list must be revisited');
  }
});

test('routes are unique, parented and acyclic', () => {
  const { api } = mount({});
  const model = api.getModel();

  assert.equal(model.routes.length, 13);
  const seen = new Set();
  for (const route of model.routes) {
    const key = route.from + '->' + route.to;
    assert.ok(!seen.has(key), 'duplicate route ' + key);
    seen.add(key);
    assert.ok(model.solarByKey[route.from], 'route from a real destination');
    assert.ok(model.solarByKey[route.to], 'route to a real destination');
  }
  /* Walking parents must always terminate at the launch site. */
  for (const node of model.solar) {
    let cursor = node;
    const guard = new Set();
    while (cursor.parent) {
      assert.ok(!guard.has(cursor.id), 'cycle through ' + cursor.id);
      guard.add(cursor.id);
      cursor = model.solarByKey[cursor.parent];
    }
    assert.equal(cursor.id, 'spaceRocket');
  }
});

test('model validation reports a clean shipped world', () => {
  const { api } = mount({ stars: 4, starRange: 8 });
  const d = api.getModel().diagnostics;
  assert.deepEqual(list(d.missingAnchors), []);
  assert.deepEqual(list(d.invalidParents), []);
  assert.deepEqual(list(d.duplicateIds), []);
  assert.deepEqual(list(d.duplicateRoutes), []);
  assert.deepEqual(list(d.orphans), []);
  assert.deepEqual(list(d.actionless), []);
});

test('the model is deterministic across repeated builds', () => {
  const { ctx } = mount({ unlocked: ['moon', 'venus'], fuel: 100, stars: 6, starRange: 10 });
  const model = ctx.window.SpaceCompanyCelestialModel;
  const shape = () => JSON.stringify(list(model.build().all)
    .map((n) => [n.kind, n.id, n.state, n.visibility, n.domId]));
  const first = shape();
  assert.equal(shape(), first);
  assert.equal(shape(), first);
});

/* ========================================================================== *
 * Visibility and spoiler policy
 * ========================================================================== */

test('an unreached destination conceals its name and cost', () => {
  const { api, document } = mount({ unlocked: ['moon'], fuel: 1000 });
  const model = api.getModel();

  for (const node of model.solar) {
    if (node.visibility === 'visible') continue;
    assert.equal(node.publicLabel, 'Unsurveyed', node.id + ' leaked its name');
    assert.equal(node.publicCostText, null, node.id + ' leaked its cost');
    const el = nodeEl(document, 'solar:' + node.id);
    assert.ok(!el.textContent.includes(node.label), node.id + ' leaked its name into the DOM');
    const btn = selectBtn(document, 'solar:' + node.id);
    assert.equal(btn.getAttribute('tabindex'), '-1', node.id + ' is keyboard reachable');
    assert.equal(btn.getAttribute('aria-hidden'), 'true');
  }
});

test('a star outside telescope range stays uncharted', () => {
  const { api, document } = mount({ stars: 6, starRange: 8, starRocket: true });
  const model = api.getModel();

  const dark = list(model.stars).filter((s) => !s.discovered);
  assert.ok(dark.length > 0);
  for (const star of dark) {
    /* Guard against a vacuous test: the raw values must exist to be concealed. */
    assert.equal(typeof star.name, 'string');
    assert.equal(typeof star.faction, 'string');
    assert.equal(star.publicLabel, 'Uncharted system');
    assert.equal(star.publicFaction, null);
    assert.equal(star.publicDistance, null);
    const el = nodeEl(document, 'star:' + star.id);
    assert.ok(!el.textContent.includes(star.name), star.id + ' leaked its name');
    assert.ok(!el.textContent.includes(star.faction), star.id + ' leaked its faction');
    assert.equal(selectBtn(document, 'star:' + star.id).getAttribute('tabindex'), '-1');
  }
  /* In-range systems are named, because the legacy row is already visible. */
  const lit = list(model.stars).filter((s) => s.discovered);
  assert.ok(lit.length > 0);
  assert.equal(lit[0].publicLabel, lit[0].name);
});

test('the launch vehicle reads as spent, not as undiscovered, after launching', () => {
  const before = mount({ unlocked: ['spaceRocket'] }).api.getModel().solarByKey.spaceRocket;
  assert.equal(before.state, 'ready');

  /* `launchRocket()` hides the row; the canonical flag is what distinguishes
     "already launched" from "never reached". */
  const after = mount({ launched: true }).api.getModel().solarByKey.spaceRocket;
  assert.equal(after.visibility, 'visible');
  assert.equal(after.state, 'explored');
  assert.equal(after.publicLabel, 'Launch Vehicle');
});

/* ========================================================================== *
 * States, costs and the frontier
 * ========================================================================== */

test('cost comes from the published span, never from a copied constant', () => {
  const { api } = mount({ unlocked: ['moon'], fuel: 100 });
  const moon = api.getModel().solarByKey.moon;
  assert.equal(moon.cost, 20);
  assert.equal(moon.affordable, true);
  assert.equal(moon.state, 'ready');

  const source = stripComments(readFileSync(join(ROOT, 'ui/modern/celestialModel.js'), 'utf8'));
  for (const literal of ['20', '50', '80', '200', '500', '1000', '2000', '5000', '6000', '7000']) {
    assert.ok(!new RegExp('fuel\\s*[:=]\\s*' + literal + '\\b').test(source),
      'the model must not hardcode a fuel cost (' + literal + ')');
  }
  assert.ok(!/10000/.test(source), 'the model must not copy the antimatter cost formula');
});

test('too little fuel reads as reachable-but-blocked, not as unavailable', () => {
  const { api } = mount({ unlocked: ['asteroidBelt'], fuel: 10 });
  const belt = api.getModel().solarByKey.asteroidBelt;
  assert.equal(belt.state, 'blocked');
  assert.equal(belt.actionable, true, 'still actionable — the canonical action enforces the cost');
  assert.equal(belt.missing, 190);
});

test('survey-only bodies never offer an action', () => {
  const { api } = mount({ unlocked: ['mercury', 'uranus', 'neptune'], fuel: 1e9 });
  const model = api.getModel();
  for (const id of ['mercury', 'uranus', 'neptune']) {
    assert.equal(model.solarByKey[id].state, 'survey');
    assert.equal(model.solarByKey[id].actionable, false);
  }
});

test('the frontier prefers an affordable destination and never an unreachable one', () => {
  const cheap = mount({ unlocked: ['moon', 'asteroidBelt'], fuel: 100 }).api.getModel();
  assert.equal(cheap.frontier.id, 'moon', 'cheapest affordable first');

  const poor = mount({ unlocked: ['asteroidBelt'], fuel: 1 }).api.getModel();
  assert.equal(poor.frontier.id, 'asteroidBelt');
  assert.equal(poor.frontier.visibility, 'visible', 'never recommends a concealed destination');

  /* A ready star outranks a merely-visible solar body. */
  const stellar = mount({
    unlocked: ['moon'], explored: ['moon'], fuel: 0, stars: 3, starRange: 20, starRocket: true
  }).api.getModel();
  assert.equal(stellar.frontier.kind, 'star');
  assert.equal(stellar.frontier.actionable, true);
});

/* ========================================================================== *
 * Canonical action delegation
 * ========================================================================== */

test('exploring runs the canonical path exactly once and deducts the canonical cost', () => {
  const { api, document, ctx, calls } = mount({ unlocked: ['moon'], fuel: 100 });

  const acted = api.act('solar:moon');
  assert.equal(acted, true);

  assert.equal(ctx.rocketFuel, 80, 'exactly one canonical deduction of 20');
  assert.deepEqual(list(ctx.explored), ['moon']);
  assert.equal(calls.statistics.placesExplored, 1, 'the canonical statistic fired once');
  assert.equal(calls.refreshResources, 1);
  assert.deepEqual(list(calls.newUnlock), ['resources']);
  assert.ok(list(ctx.buttonsHidden).includes('exploreMoon'));

  /* The projection caught up without another tick, and wrote nothing itself. */
  assert.equal(api.getModel().solarByKey.moon.state, 'explored');
  assert.ok(nodeEl(document, 'solar:moon').className.includes('sc-state-explored'));
});

test('a second activation of an explored destination is inert', () => {
  const { api, ctx, calls } = mount({ unlocked: ['moon'], fuel: 100 });
  api.act('solar:moon');
  const fuelAfter = ctx.rocketFuel;

  assert.equal(api.act('solar:moon'), false);
  assert.equal(api.act('solar:moon'), false);
  assert.equal(ctx.rocketFuel, fuelAfter, 'no further deduction');
  assert.equal(calls.statistics.placesExplored, 1);
  assert.deepEqual(list(ctx.explored), ['moon']);
});

test('an unaffordable action leaves canonical state untouched', () => {
  const { api, ctx, calls } = mount({ unlocked: ['asteroidBelt'], fuel: 5 });
  const before = snapshot(ctx);

  api.act('solar:asteroidBelt');

  assert.equal(ctx.rocketFuel, 5, 'the canonical guard refused to spend');
  assert.deepEqual(list(ctx.explored), []);
  assert.equal(calls.statistics.placesExplored, undefined);
  assert.equal(snapshot(ctx), before);
});

test('a locked destination cannot be acted upon at all', () => {
  const { api, ctx, calls } = mount({ unlocked: [], fuel: 1e9 });
  assert.equal(api.act('solar:jupiter'), false);
  assert.deepEqual(list(ctx.explored), []);
  assert.equal(calls.statistics.placesExplored, undefined);
});

test('exploring propagates the canonical unlock to its successors', () => {
  const { api, ctx, document } = mount({ unlocked: ['asteroidBelt'], fuel: 1000 });
  assert.equal(api.getModel().solarByKey.jupiter.visibility, 'undiscovered');

  api.act('solar:asteroidBelt');

  /* `explore('AsteroidBelt')` is what un-hides the outer system. */
  assert.equal(document.getElementById('jupiter').className, 'outer');
  assert.equal(api.getModel().solarByKey.jupiter.visibility, 'visible');
  assert.equal(api.getModel().solarByKey.jupiter.publicLabel, 'Jupiter');
});

test('selecting a destination delegates to the legacy row and mutates nothing', () => {
  const { api, ctx, document, calls } = mount({ unlocked: ['moon'], fuel: 100 });
  let rowClicks = 0;
  document.getElementById('moon').onclick = () => { rowClicks++; };
  const before = snapshot(ctx);

  selectBtn(document, 'solar:moon').click();

  assert.equal(rowClicks, 1, 'the legacy row handler ran exactly once');
  assert.equal(api.getSelection(), 'solar:moon');
  assert.equal(selectBtn(document, 'solar:moon').getAttribute('aria-pressed'), 'true');
  assert.equal(snapshot(ctx), before, 'selection changed gameplay state');
  assert.equal(calls.statistics.placesExplored, undefined);
});

test('a star action dispatches the canonical control exactly once', () => {
  const { api, calls, starEntries } = mount({ stars: 3, starRange: 20, starRocket: true });
  const id = Object.keys(starEntries)[0];

  assert.equal(api.act('star:' + id), true);
  assert.equal(calls.statistics.starExplored, 1);
  assert.equal(starEntries[id].explored, true);

  assert.equal(api.act('star:' + id), false, 'an explored system is no longer actionable');
  assert.equal(calls.statistics.starExplored, 1);
});

test('a star cannot be travelled to without the canonical rocket', () => {
  const { api, calls, starEntries } = mount({ stars: 3, starRange: 20, starRocket: false });
  const id = Object.keys(starEntries)[0];
  assert.equal(api.getModel().starsByKey[id].state, 'blocked');
  assert.equal(api.act('star:' + id), false);
  assert.equal(calls.statistics.starExplored, undefined);
});

/* ========================================================================== *
 * Source-level guarantees
 * ========================================================================== */

test('neither M4 file mutates canonical state or touches storage', () => {
  for (const file of ['ui/modern/celestialModel.js', 'ui/modern/celestialCommandCenter.js']) {
    const body = stripComments(readFileSync(join(ROOT, file), 'utf8'));
    for (const forbidden of [
      /localStorage/, /sessionStorage/,
      /\bexplore\s*\(\s*['"]/,                       // never call explore() directly
      /takeResource\s*\(/, /\brocketFuel\s*[-+]=/, /\bantimatter\s*[-+]?=[^=]/,
      /\bexploreSystem\s*\(/, /\blaunchRocket\s*\(/, /\bgetRocket\s*\(/,
      /\b(?:explored|buttonsHidden|resourcesUnlocked|tabsUnlocked)\s*\.\s*(?:push|splice|pop|shift)/,
      /\bwindow\s*\.\s*(?:explored|buttonsHidden|resourcesUnlocked|tabsUnlocked|rocketLaunched|rocket)\s*=[^=]/,
      /\bGame\s*\.[\w.]+\s*=[^=]/,
      /\.\s*(?:owned|unlocked|built)\s*=[^=]/
    ]) {
      assert.ok(!forbidden.test(body), file + ' must not contain ' + forbidden);
    }
  }
  /* The view reaches the game only by clicking real controls. */
  const view = stripComments(readFileSync(join(ROOT, 'ui/modern/celestialCommandCenter.js'), 'utf8'));
  assert.equal((view.match(/control\.click\(\)/g) || []).length, 1,
    'exactly one canonical action dispatch site');
});

test('no second loop, timer or observer is introduced', () => {
  for (const file of ['ui/modern/celestialModel.js', 'ui/modern/celestialCommandCenter.js']) {
    const body = stripComments(readFileSync(join(ROOT, file), 'utf8'));
    for (const forbidden of [/setInterval/, /setTimeout/, /requestAnimationFrame/, /MutationObserver/]) {
      assert.ok(!forbidden.test(body), file + ' must not contain ' + forbidden);
    }
  }
});

/* ========================================================================== *
 * Lifecycle
 * ========================================================================== */

test('repeated initialisation and updates never duplicate anything', () => {
  const { api, pane, document } = mount({ unlocked: ['moon'], fuel: 100, stars: 4, starRange: 20 });
  const count = () => ({
    roots: pane.byClass('sc-cel').length,
    nodes: pane.byClass('sc-cel-node').length,
    stars: pane.byClass('sc-cel-star').length,
    total: pane.descendants().length,
    listeners: pane.byClass('sc-cel')[0].listeners.click.length
  });
  const first = count();

  for (let i = 0; i < 15; i++) { api.component.initialise(); api.component.update(); }

  assert.deepEqual(count(), first, 'the component grew on re-initialisation');
  const ids = pane.byClass('sc-cel-node').concat(pane.byClass('sc-cel-star')).map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate modern id');
  assert.equal(first.listeners, 1, 'exactly one delegated listener');
});

test('the whole component uses one delegated listener', () => {
  const { pane } = mount({ unlocked: ['moon'] });
  let bound = 0;
  for (const el of pane.descendants()) {
    if (el.listeners && el.listeners.click) bound += el.listeners.click.length;
  }
  assert.equal(bound, 1);
});

/* ========================================================================== *
 * Fallbacks and contracts
 * ========================================================================== */

test('?space=legacy builds no map and leaves the legacy panes alone', () => {
  const { api, document, pane } = mount({ search: '?space=legacy', unlocked: ['moon'] });
  assert.equal(api.mode, 'legacy');
  assert.equal(api.isMap, false);
  assert.equal(document.getElementById('scCelestialCenter'), null);
  assert.equal(pane.byClass('sc-cel-node').length, 0);
  assert.ok(document.getElementById('exploreMoon'), 'the legacy explore row survives');
});

test('?ui=legacy also restores the legacy celestial panes', () => {
  const { api, document } = mount({ search: '?ui=legacy' });
  assert.equal(api.mode, 'legacy');
  assert.equal(document.getElementById('scCelestialCenter'), null);
});

test('an unrelated query does not trigger the fallback', () => {
  assert.equal(mount({ search: '?research=legacy' }).api.mode, 'map');
  assert.equal(mount({ search: '?resources=legacy' }).api.mode, 'map');
  assert.equal(mount({ search: '?space=map' }).api.mode, 'map');
});

test('the celestial stylesheet never overrides the legacy .hidden contract', () => {
  const css = stripComments(readFileSync(join(ROOT, 'styles/modern/celestial.css'), 'utf8'));
  const hiddenRules = css.split('}')
    .filter((rule) => /\.hidden\b/.test(rule.split('{')[0] || ''));
  assert.deepEqual(hiddenRules, [],
    'celestial.css must not include .hidden in any selector — Bootstrap owns it');
  assert.ok(css.includes('#scCelestialCenter ~ .container'),
    'the sibling combinator is what makes the legacy fallback structural');
});

test('index.html wires the celestial view without adding trackers or remote assets', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.includes('ui/modern/celestialModel.js'));
  assert.ok(html.includes('ui/modern/celestialCommandCenter.js'));
  assert.ok(html.includes('styles/modern/celestial.css'));
  assert.ok(html.includes('data-space'), 'the mode must resolve before stylesheets');

  for (const tag of html.match(/<script\b[^>]*>/gi) || []) {
    assert.ok(!/google-analytics|googletagmanager|kongregate/i.test(tag), 'tracker script: ' + tag);
  }
  /* No modern file may reference a remote image or API. */
  for (const file of ['ui/modern/celestialModel.js', 'ui/modern/celestialCommandCenter.js',
    'styles/modern/celestial.css']) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(src), file + ' references a remote resource');
  }
});

/* ========================================================================== *
 * The inherited duplicate-ID defect
 * ========================================================================== */

test('the faction star heading no longer collides with the travel heading', () => {
  const source = readFileSync(join(ROOT, 'ui/interstellarUI.js'), 'utf8');
  const nameIds = source.match(/id="\{\{htmlId\}\}(_conquer)?_name"/g) || [];

  assert.equal(nameIds.length, 2, 'both star templates still emit a heading id');
  assert.equal(new Set(nameIds).size, 2,
    'the two star templates must not emit the same id (79 duplicates before M4)');
  assert.ok(source.includes('id="{{htmlId}}_conquer_name"'));

  /* The ids code actually consumes are untouched. */
  assert.ok(source.includes('id="{{htmlId}}_owned"'));
  assert.ok(source.includes('id="{{htmlId}}_conquer"'));
});

/** Everything the projection is forbidden to change. */
function snapshot(ctx) {
  return JSON.stringify({
    fuel: ctx.rocketFuel,
    launched: ctx.rocketLaunched,
    explored: list(ctx.explored),
    buttonsHidden: list(ctx.buttonsHidden),
    resourcesUnlocked: list(ctx.resourcesUnlocked),
    tabsUnlocked: list(ctx.tabsUnlocked)
  });
}
