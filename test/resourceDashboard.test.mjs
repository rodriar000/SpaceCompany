/*
 * M2 resource dashboard: functional characterization of
 * ui/modern/resourceDashboard.js.
 *
 * The dashboard is a PROJECTION of the legacy resource list, so these tests
 * drive the real module against a legacy-shaped fixture and assert the
 * properties the milestone promises:
 *   - one card per legacy `<res>Nav` row, grouped by the `collapse*` rows;
 *   - lock + selection state mirror the row (never the other way round);
 *   - activating a card dispatches a real click ON the legacy row;
 *   - the view is strictly read-only over game state and the save;
 *   - `?ui=legacy` / `?resources=legacy` build nothing at all;
 *   - a missing/!broken legacy list degrades without throwing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createDocument, element } from './helpers/miniDom.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODULE = 'ui/modern/resourceDashboard.js';
const source = readFileSync(join(ROOT, MODULE), 'utf8');

/* -------------------------------------------------------------------------- */
/* Fixture: a faithful miniature of the legacy #resourceNavParent table.       */
/* -------------------------------------------------------------------------- */

const RESOURCES = [
  { id: 'plasma', name: 'Plasma', group: null, locked: true },
  { id: 'energy', name: 'Energy', group: null, locked: true },
  { id: 'metal', name: 'Metal', group: 'Earth Resources', locked: false },
  { id: 'wood', name: 'Wood', group: 'Earth Resources', locked: false },
  { id: 'gold', name: 'Gold', group: 'Inner Planetary Resources', locked: true },
];

function buildLegacyRow(spec) {
  const row = element('tr', {
    id: spec.id + 'Nav',
    className: spec.locked ? 'sideTab hidden' : 'earth sideTab',
    attrs: { 'data-toggle': 'tab', href: '#' + spec.id + 'Tab' },
  });
  const iconCell = element('td');
  iconCell.appendChild(element('img', { attrs: { src: 'Icons/' + spec.id + 'Icon.png' } }));
  row.appendChild(iconCell);
  row.appendChild(element('td', { text: '\n\t\t' + spec.name + '\n\t' }));
  const rateCell = element('td');
  rateCell.appendChild(element('span', { id: spec.id + 'ps', text: '0' }));
  row.appendChild(rateCell);
  const valueCell = element('td');
  valueCell.appendChild(element('span', { id: spec.id, text: '0' }));
  row.appendChild(valueCell);
  return row;
}

function buildFixture(document) {
  const pane = element('div', { id: 'resources' });
  const column = element('div', { className: 'container col-xs-1' });
  const table = element('table', { id: 'resourceNavParent' });

  let openGroup = null;
  for (const spec of RESOURCES) {
    if (spec.group && spec.group !== openGroup) {
      openGroup = spec.group;
      const header = element('tr', {
        id: 'collapse' + spec.group.split(' ')[0],
        className: 'collapse' + spec.group.split(' ')[0],
      });
      header.appendChild(element('td', { text: spec.group + ' ' }));
      table.appendChild(header);
    }
    table.appendChild(buildLegacyRow(spec));
  }

  column.appendChild(table);
  pane.appendChild(column);
  pane.appendChild(element('div', { id: 'resourceTabParent' }));
  document.body.appendChild(pane);
  return { pane, table };
}

/* -------------------------------------------------------------------------- */
/* Sandbox                                                                     */
/* -------------------------------------------------------------------------- */

function createSandbox({ search = '', withFixture = true, storage } = {}) {
  const document = createDocument();
  const fixture = withFixture ? buildFixture(document) : { pane: null, table: null };

  /* Live game values — the ONLY source of numbers the dashboard may read. */
  const state = {
    plasma: 350, plasmaps: 3, plasmaStorage: 100000,
    energy: 61234, energyps: -2940, energyStorage: 100000,
    metal: 842, metalps: 260, metalStorage: 1000,
    wood: 500, woodps: 0, woodStorage: 500,
    gold: 10, goldps: 45, goldStorage: -1, // uncapped
  };
  const snapshot = { ...state };

  const localStorageCalls = [];
  const store = storage || new Map([['save', '{"companyName":"ACME"}']]);

  const sandbox = {
    console: { error: () => {}, warn: () => {}, log: () => {} },
    Math,
    Number,
    String,
    isNaN,
    document,
    getResource: (id) => state[id],
    getStorage: (id) => state[id + 'Storage'],
    getProduction: (id) => state[id + 'ps'],
    Game: {
      uiComponents: [],
      settings: { format: (v) => String(Math.round(Number(v))) },
      utils: {
        getFullTimeDisplay: (s) => 'T' + Math.round(s),
        // Same decomposition contract as utils.js: [y, d, h, m, s, ms],
        // years extracted first (which is why getFullTimeDisplay loses them).
        splitDateTime: (seconds) => {
          let ms = Math.floor(seconds * 1000);
          const y = Math.floor(ms / (365 * 24 * 3600 * 1000)); ms %= 365 * 24 * 3600 * 1000;
          const d = Math.floor(ms / (24 * 3600 * 1000)); ms %= 24 * 3600 * 1000;
          const h = Math.floor(ms / (3600 * 1000)); ms %= 3600 * 1000;
          const m = Math.floor(ms / 60000); ms %= 60000;
          return [y, d, h, m, Math.floor(ms / 1000), ms];
        },
      },
      resourceData: { metal: { desc: 'Metal is useful.' } },
      resourcesUI: {
        // Distinctive outputs prove the legacy delegates are what render numbers.
        createResourceDelegate: (id) => () => 'cur:' + state[id],
        createStorageDelegate: (id) => () => 'cap:' + state[id + 'Storage'],
        createProductionDelegate: (id) => () => String(state[id + 'ps']),
      },
    },
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.location = { search };
  sandbox.localStorage = {
    getItem(key) { localStorageCalls.push(['get', key]); return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { localStorageCalls.push(['set', key]); store.set(key, value); },
    removeItem(key) { localStorageCalls.push(['remove', key]); store.delete(key); },
  };

  const ctx = vm.createContext(sandbox);
  vm.runInContext(source, ctx, { filename: MODULE });

  return { ctx, sandbox, document, fixture, state, snapshot, localStorageCalls, store };
}

/** Run the component the way Game.loadDelay + the UI interval do. */
function boot(env) {
  const component = env.sandbox.Game.uiComponents[0];
  component.initialise();
  return component;
}

const dashboardOf = (env) => env.document.getElementById('scResourceDashboard');
const cardsOf = (env) => {
  const root = dashboardOf(env);
  return root ? root.byClass('sc-res-card') : [];
};
const cardFor = (env, id) => cardsOf(env).find((c) => c.getAttribute('data-resource') === id);
const hasClass = (node, name) => (' ' + node.className + ' ').indexOf(' ' + name + ' ') !== -1;
const textOf = (card, className) => card.byClass(className)[0].textContent;

/* -------------------------------------------------------------------------- */
/* Projection                                                                  */
/* -------------------------------------------------------------------------- */

test('registers exactly one UI component with the game loop', () => {
  const env = createSandbox();
  assert.equal(env.sandbox.Game.uiComponents.length, 1);
  assert.equal(typeof env.sandbox.Game.uiComponents[0].initialise, 'function');
  assert.equal(typeof env.sandbox.Game.uiComponents[0].update, 'function');
});

test('projects one card per legacy resource row, in document order', () => {
  const env = createSandbox();
  boot(env);
  const ids = cardsOf(env).map((c) => c.getAttribute('data-resource'));
  assert.deepEqual(ids, RESOURCES.map((r) => r.id));
});

test('groups cards by the legacy collapse rows and titles them from the DOM', () => {
  const env = createSandbox();
  boot(env);
  const titles = dashboardOf(env).byClass('sc-res-group__title').map((t) => t.textContent);
  assert.deepEqual(titles, ['Earth Resources', 'Inner Planetary Resources']);
});

test('card identity (name, icon, description) is read from the legacy row', () => {
  const env = createSandbox();
  boot(env);
  const metal = cardFor(env, 'metal');
  assert.equal(textOf(metal, 'sc-res-card__name'), 'Metal');
  assert.equal(metal.byClass('sc-res-card__icon')[0].getAttribute('src'), 'Icons/metalIcon.png');
  assert.equal(metal.getAttribute('title'), 'Metal is useful.');
  assert.equal(metal.getAttribute('data-nav'), 'metalNav');
});

test('numbers are rendered by the legacy formatting delegates (no second formatter)', () => {
  const env = createSandbox();
  boot(env);
  const metal = cardFor(env, 'metal');
  assert.equal(textOf(metal, 'sc-res-card__current'), 'cur:842');
  assert.equal(textOf(metal, 'sc-res-card__capacity'), 'cap:1000');
  assert.equal(textOf(metal, 'sc-res-card__rate-value'), '260');
});

test('a negative rate renders one sign, not two', () => {
  const env = createSandbox();
  boot(env);
  const energy = cardFor(env, 'energy');
  assert.equal(textOf(energy, 'sc-res-card__rate-glyph'), '−');
  assert.equal(textOf(energy, 'sc-res-card__rate-value'), '2940',
    'the delegate minus is dropped in favour of the glyph');
  assert.ok(hasClass(energy.byClass('sc-res-card__rate')[0], 'is-negative'));
});

test('uncapped storage shows infinity and hides the meter', () => {
  const env = createSandbox();
  boot(env);
  const gold = cardFor(env, 'gold');
  assert.equal(textOf(gold, 'sc-res-card__capacity'), '∞');
  assert.ok(hasClass(gold.byClass('sc-res-card__meter')[0], 'is-hidden'));
});

test('storage fill and ETA are derived from live values', () => {
  const env = createSandbox();
  const component = boot(env);
  const metal = cardFor(env, 'metal');
  // 842 / 1000 -> 84.2%
  assert.equal(metal.byClass('sc-res-card__fill')[0].style.width, '84.2%');
  assert.equal(metal.byClass('sc-res-card__meter')[0].getAttribute('aria-valuenow'), '84');
  // Metal's own gap here is (1000 - 842) / 260 = 0.6s, i.e. below the
  // one-second floor, so no ETA is offered.
  assert.equal(textOf(metal, 'sc-res-card__eta'), '');
  // Drain side: 61234 / 2940 = 20.8s, via the game's own clock helper.
  assert.equal(textOf(cardFor(env, 'energy'), 'sc-res-card__eta'), 'empty in T21');

  // Widen the cap and the fill and the ETA both follow the live values.
  env.state.metalStorage = 842 + 260 * 300;
  component.update(0.1);
  assert.equal(textOf(metal, 'sc-res-card__eta'), 'full in T300');
  // 842 / 78842 -> 1.1%
  assert.equal(metal.byClass('sc-res-card__fill')[0].style.width, '1.1%');
  assert.equal(metal.byClass('sc-res-card__meter')[0].getAttribute('aria-valuenow'), '1');
});

test('long ETAs are compacted so a card can never truncate them', () => {
  const env = createSandbox();
  const component = boot(env);
  const eta = () => textOf(cardFor(env, 'metal'), 'sc-res-card__eta');
  const DAY = 24 * 3600;

  // Under a day: identical to the detail panel's clock (getFullTimeDisplay).
  env.state.metalStorage = 842 + 260 * 3600;
  component.update(0.1);
  assert.equal(eta(), 'full in T3600');

  // Past a day: the meaningless HH:MM:SS tail is dropped. The long form
  // ("93 Days 16:53:07") is what overflowed the card at late-game scale.
  env.state.metalStorage = 842 + 260 * (93 * DAY + 16 * 3600);
  component.update(0.1);
  assert.equal(eta(), 'full in 93d 16h');

  // Past a year: getFullTimeDisplay would print "30 Days …" because it reads
  // only splitDateTime()[1] and drops the years. The card must stay truthful.
  env.state.metalStorage = 842 + 260 * ((2 * 365 + 30) * DAY);
  component.update(0.1);
  assert.equal(eta(), 'full in 2y 30d');
  assert.equal(env.sandbox.Game.utils.getFullTimeDisplay(0), 'T0',
    'the legacy helper itself is left untouched');
});

test('sub-second ETAs are dropped rather than shown as 00:00:00', () => {
  const env = createSandbox();
  const component = boot(env);
  // 260/s into a 0.1-unit gap -> well under a second.
  env.state.metalStorage = 842.1;
  component.update(0.1);
  assert.equal(textOf(cardFor(env, 'metal'), 'sc-res-card__eta'), '');

  // One second is the threshold, and it still renders.
  env.state.metalStorage = 842 + 260;
  component.update(0.1);
  assert.equal(textOf(cardFor(env, 'metal'), 'sc-res-card__eta'), 'full in T1');
});

test('no ETA string is wide enough to clip a card', () => {
  const env = createSandbox();
  const component = boot(env);
  const DAY = 24 * 3600;
  // Sweep magnitudes from seconds to millennia.
  for (const seconds of [1, 59, 3599, 86399, 3 * DAY, 93 * DAY, 364 * DAY,
    2 * 365 * DAY, 999 * 365 * DAY]) {
    env.state.metalStorage = 842 + 260 * seconds;
    component.update(0.1);
    const text = textOf(cardFor(env, 'metal'), 'sc-res-card__eta');
    assert.ok(text.length <= 20, `ETA "${text}" (${text.length} chars) must stay compact`);
  }
});

test('state is classified and labelled, never carried by colour alone', () => {
  const env = createSandbox();
  boot(env);
  const label = (id) => textOf(cardFor(env, id), 'sc-res-card__state-label');
  assert.equal(label('metal'), 'Producing');
  assert.equal(label('energy'), 'Draining');
  assert.equal(label('wood'), 'Full');   // wood 500/500
  assert.equal(label('plasma'), 'Producing');
  for (const id of ['metal', 'energy', 'wood']) {
    assert.notEqual(textOf(cardFor(env, id), 'sc-res-card__state-glyph'), '',
      'every state also carries a glyph');
  }
});

/* -------------------------------------------------------------------------- */
/* Mirroring the legacy row (the row is always the source of truth)            */
/* -------------------------------------------------------------------------- */

test('locked resources mirror the legacy .hidden class', () => {
  const env = createSandbox();
  const component = boot(env);
  assert.ok(hasClass(cardFor(env, 'gold'), 'sc-is-locked'), 'locked row -> locked card');
  assert.ok(!hasClass(cardFor(env, 'metal'), 'sc-is-locked'));

  // The game unlocks a resource the way refreshResources() does: by rewriting
  // the row's className. The next tick must follow.
  env.document.getElementById('goldNav').className = 'innerPlanet sideTab';
  component.update(0.1);
  assert.ok(!hasClass(cardFor(env, 'gold'), 'sc-is-locked'), 'unlock propagates to the card');
});

test('the dashboard never adds, removes or overrides the legacy .hidden class', () => {
  const env = createSandbox();
  const component = boot(env);
  const before = RESOURCES.map((r) => env.document.getElementById(r.id + 'Nav').className);
  for (let i = 0; i < 20; i++) component.update(0.1);
  const after = RESOURCES.map((r) => env.document.getElementById(r.id + 'Nav').className);
  assert.deepEqual(after, before, 'legacy row classes are untouched by the view');
});

test('a group with nothing unlocked collapses away', () => {
  const env = createSandbox();
  const component = boot(env);
  const groups = dashboardOf(env).byClass('sc-res-group');
  const inner = groups.find((g) => g.getAttribute('data-group') === 'inner');
  assert.ok(inner, 'the inner-planetary group exists');
  assert.ok(hasClass(inner, 'sc-is-empty'), 'hidden while gold is locked');

  env.document.getElementById('goldNav').className = 'innerPlanet sideTab';
  component.update(0.1);
  assert.ok(!hasClass(inner, 'sc-is-empty'), 'revealed once a member unlocks');
});

test('selection mirrors the `info` class that activeResourceTab() applies', () => {
  const env = createSandbox();
  const component = boot(env);
  assert.equal(cardFor(env, 'metal').getAttribute('aria-pressed'), 'false');
  assert.ok(!hasClass(dashboardOf(env), 'sc-has-selection'));

  env.document.getElementById('metalNav').className += ' info';
  component.update(0.1);

  assert.equal(cardFor(env, 'metal').getAttribute('aria-pressed'), 'true');
  assert.ok(hasClass(cardFor(env, 'metal'), 'sc-is-selected'));
  assert.ok(hasClass(dashboardOf(env), 'sc-has-selection'), 'the empty-state hint is dismissed');
});

/* -------------------------------------------------------------------------- */
/* Interaction                                                                 */
/* -------------------------------------------------------------------------- */

test('activating a card dispatches a real click on its legacy row', () => {
  const env = createSandbox();
  boot(env);
  const row = env.document.getElementById('metalNav');
  let clicks = 0;
  row.click = () => { clicks++; row.className += ' info'; };

  cardFor(env, 'metal').click();

  assert.equal(clicks, 1, 'exactly one click, delegated to the legacy row');
  assert.equal(cardFor(env, 'metal').getAttribute('aria-pressed'), 'true');
});

test('clicking a nested part of a card still activates it', () => {
  const env = createSandbox();
  boot(env);
  const row = env.document.getElementById('metalNav');
  let clicks = 0;
  row.click = () => { clicks++; };

  cardFor(env, 'metal').byClass('sc-res-card__icon')[0].click();
  cardFor(env, 'metal').byClass('sc-res-card__rate-value')[0].click();

  assert.equal(clicks, 2);
});

test('the density toggle flips the presentation attribute and persists it', () => {
  const env = createSandbox();
  boot(env);
  const root = dashboardOf(env);
  assert.equal(root.getAttribute('data-density'), 'comfortable');

  env.document.getElementById('scResourceDensity').onclick();
  assert.equal(root.getAttribute('data-density'), 'compact');
  assert.equal(env.store.get('sc.ui.resourceDensity'), 'compact');

  env.document.getElementById('scResourceDensity').onclick();
  assert.equal(root.getAttribute('data-density'), 'comfortable');
});

test('a stored density preference is restored on load', () => {
  const store = new Map([['sc.ui.resourceDensity', 'compact']]);
  const env = createSandbox({ storage: store });
  boot(env);
  assert.equal(dashboardOf(env).getAttribute('data-density'), 'compact');
});

/* -------------------------------------------------------------------------- */
/* Read-only guarantees                                                        */
/* -------------------------------------------------------------------------- */

test('the view never mutates game state', () => {
  const env = createSandbox();
  const component = boot(env);
  for (let i = 0; i < 50; i++) component.update(0.1);
  cardFor(env, 'metal').click();
  component.update(0.1);
  assert.deepEqual(env.state, env.snapshot, 'no resource, rate or storage global changed');
});

test('localStorage is touched ONLY for the density preference — never the save', () => {
  const env = createSandbox();
  const component = boot(env);
  env.document.getElementById('scResourceDensity').onclick();
  for (let i = 0; i < 10; i++) component.update(0.1);

  const keys = new Set(env.localStorageCalls.map(([, key]) => key));
  assert.deepEqual([...keys], ['sc.ui.resourceDensity']);
  assert.equal(env.store.get('save'), '{"companyName":"ACME"}', 'the save is byte-identical');
});

test('the module source never references the save key or game persistence', () => {
  const codeOnly = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert.doesNotMatch(codeOnly, /localStorage\s*\[|getItem\(\s*["']save["']|setItem\(\s*["']save["']/,
    'no access to localStorage["save"]');
  assert.doesNotMatch(codeOnly, /Game\.save\b|Game\.load\b|legacySave|legacyLoad/,
    'no call into game persistence');
  assert.doesNotMatch(codeOnly, /\baddResource\b|\btakeResource\b|\bsetPerSecondProduction\b/,
    'no call into resource mutation');
});

/* -------------------------------------------------------------------------- */
/* Fallbacks and degradation                                                   */
/* -------------------------------------------------------------------------- */

for (const search of ['?ui=legacy', '?resources=legacy', '?debug=1&resources=legacy']) {
  test(`${search} builds no dashboard and leaves the legacy list alone`, () => {
    const env = createSandbox({ search });
    assert.equal(env.sandbox.SpaceCompanyResources.mode, 'legacy');
    boot(env);
    assert.equal(dashboardOf(env), null);
    assert.ok(env.document.getElementById('resourceNavParent'), 'the legacy table is still there');
  });
}

test('an unrelated query value still yields the card dashboard', () => {
  for (const search of ['', '?ui=fancy', '?resources=cards', '?theme=legacy']) {
    const env = createSandbox({ search });
    assert.equal(env.sandbox.SpaceCompanyResources.mode, 'cards', `for "${search}"`);
  }
});

test('a missing legacy list degrades quietly instead of throwing', () => {
  const env = createSandbox({ withFixture: false });
  const component = boot(env);
  assert.equal(dashboardOf(env), null);
  component.update(0.1); // must not throw
});

test('initialising twice does not build a second dashboard', () => {
  const env = createSandbox();
  const component = boot(env);
  component.initialise();
  assert.equal(env.document.body.byClass('sc-res-dash').length, 1);
});

test('every card is a real button with an accessible pressed state', () => {
  const env = createSandbox();
  boot(env);
  for (const card of cardsOf(env)) {
    assert.equal(card.tagName, 'BUTTON', 'cards are buttons, so keyboard works natively');
    assert.equal(card.type, 'button');
    assert.ok(['true', 'false'].includes(card.getAttribute('aria-pressed')));
  }
});
