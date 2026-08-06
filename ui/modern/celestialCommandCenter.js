/* ============================================================================
 * Space Company — Celestial Operations Command Center (first-party, M4)
 *
 * Renders the orbital map, the interstellar network and the destination
 * inspector inside the `#solarSystem` pane, over the read-only projection
 * built by `ui/modern/celestialModel.js`.
 *
 * DESIGN: the map is a VIEW, the legacy panes are still the machinery
 * -----------------------------------------------------------------------------
 * Every legacy row, pane, id and handler stays in the document. `explore()`,
 * `activeSolarTab()`, `launchRocket()` and `Game.interstellar.stars.exploreSystem()`
 * keep writing to them exactly as before — several through unguarded
 * `getElementById(...).className = ...` calls that would throw if anything were
 * removed. Modern CSS only takes the legacy navigation column out of view.
 *
 * Selecting a destination dispatches a real click on its `<tr>`, so BOTH the
 * inline `activeSolarTab(...)` handler and Bootstrap's `data-toggle="tab"`
 * data-api run unchanged. Exploring dispatches a real click on the legacy
 * explore control. Exactly one canonical action per activation, never two.
 *
 * PERFORMANCE: the DOM is built once; node geometry is derived from the ring
 * registry and fixed constants, so progress never moves a node and an update is
 * a diffed text/class refresh.
 *
 * HARD CONSTRAINTS (docs/UI_DOM_CONTRACT.md, docs/M4_CELESTIAL_OPERATIONS.md):
 *   - never reads or writes localStorage (not even a preference key)
 *   - never writes a resource, flag, exploration state or save field
 *   - never adds, removes or overrides the legacy `.hidden` class
 *   - selection is presentation-only and is never persisted
 *   - degrades safely: if anything throws, the legacy panes stay visible
 * ==========================================================================*/
(function () {
  'use strict';

  var MODE_MAP = 'map';
  var MODE_LEGACY = 'legacy';
  var ROOT_ID = 'scCelestialCenter';
  var PATH_BREAKPOINT = '(max-width: 900px)';

  /* Deterministic orbital geometry — no DOM measurement, ever. */
  var MAP = {
    width: 660,
    height: 660,
    cx: 330,
    cy: 330,
    ringRadius: { 0: 0, 1: 112, 2: 198, 3: 268 },
    ringStart: { 0: 0, 1: -90, 2: -90, 3: -90 },
    node: { w: 116, h: 62 }
  };

  var STATE = {
    ready: { glyph: '▶', label: 'Ready' },
    blocked: { glyph: '✕', label: 'Insufficient fuel' },
    explored: { glyph: '✓', label: 'Explored' },
    completed: { glyph: '✦', label: 'Conquered' },
    survey: { glyph: '◎', label: 'Survey only' },
    undiscovered: { glyph: '◇', label: 'Unsurveyed' }
  };

  var TYPE_LABEL = {
    planet: 'Planet', moon: 'Moon', belt: 'Belt', station: 'Station',
    special: 'Special site', staging: 'Launch site', star: 'Star system'
  };

  var mode = resolveMode();
  var root = null;
  var built = false;
  var model = null;
  var signature = '';
  var selectedKey = null;
  var views = [];
  var viewByKey = Object.create(null);
  var inspector = null;
  var head = null;
  var mediaQuery = null;
  var focusedOnce = false;

  /** `?ui=legacy` or `?space=legacy` restores the inherited celestial panes. */
  function resolveMode() {
    var search = (window.location && window.location.search) || '';
    return /[?&](?:ui|space)=legacy(?:&|$)/i.test(search) ? MODE_LEGACY : MODE_MAP;
  }

  function prefersReducedMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  }

  /* ------------------------------------------------------------------ DOM -- */

  function el(tag, className, parent) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (parent) parent.appendChild(node);
    return node;
  }
  function text(parent, value) {
    var node = document.createTextNode(value === undefined ? '' : value);
    parent.appendChild(node);
    return node;
  }
  function setText(node, value) { if (node && node.nodeValue !== value) node.nodeValue = value; }
  function setClass(node, value) { if (node && node.className !== value) node.className = value; }
  function setAttr(node, name, value) {
    if (node && node.getAttribute(name) !== value) node.setAttribute(name, value);
  }
  function svg(tag, className, parent) {
    var node = document.createElementNS
      ? document.createElementNS('http://www.w3.org/2000/svg', tag)
      : document.createElement(tag);
    if (className) node.setAttribute('class', className);
    if (parent) parent.appendChild(node);
    return node;
  }
  /** First `<button>` inside a legacy row — works in the browser and under test. */
  function firstButton(node) {
    if (!node || typeof node.getElementsByTagName !== 'function') return null;
    return node.getElementsByTagName('button')[0] || null;
  }

  function keyOf(node) { return node.kind + ':' + node.id; }

  /* ---------------------------------------------------------------- build -- */

  function build() {
    var pane = document.getElementById('solarSystem');
    if (!pane || document.getElementById(ROOT_ID)) return false;

    var api = window.SpaceCompanyCelestialModel;
    if (!api) return false;
    model = api.build();
    if (!model || !model.solar.length) return false;
    signature = api.signature();

    root = el('div', 'sc-cel');
    root.id = ROOT_ID;
    root.setAttribute('data-layout', MODE_MAP);

    buildHeader(root);

    var body = el('div', 'sc-cel__body', root);
    var stage = el('div', 'sc-cel__stage', body);

    buildOrbitalMap(stage);
    buildStarfield(stage);

    inspector = buildInspector(body);

    root.addEventListener('click', onClick, false);
    pane.insertBefore(root, pane.firstChild);

    bindBreakpoint();
    return true;
  }

  function buildHeader(parent) {
    var h = el('header', 'sc-cel__head', parent);
    var lead = el('div', 'sc-cel__lead', h);
    var title = el('h2', 'sc-cel__title', lead);
    text(title, 'Celestial Operations');
    var sub = el('p', 'sc-cel__sub', lead);
    text(sub, 'Select a destination to open its briefing. Distances are schematic, not to scale.');

    var stats = el('dl', 'sc-cel__stats', h);
    head = {
      region: stat(stats, 'Operating region', 'scCelRegion'),
      fuel: stat(stats, 'Rocket fuel', 'scCelFuel'),
      reachable: stat(stats, 'Ready now', 'scCelReady'),
      explored: stat(stats, 'Explored', 'scCelExplored'),
      systems: stat(stats, 'Systems', 'scCelSystems')
    };

    var actions = el('div', 'sc-cel__actions', h);
    var focus = el('button', 'sc-cel__btn', actions);
    focus.id = 'scCelFocus';
    focus.type = 'button';
    focus.setAttribute('data-action', 'focus');
    text(focus, 'Focus next objective');

    var legendBtn = el('button', 'sc-cel__btn', actions);
    legendBtn.id = 'scCelLegendToggle';
    legendBtn.type = 'button';
    legendBtn.setAttribute('data-action', 'legend');
    legendBtn.setAttribute('aria-expanded', 'false');
    legendBtn.setAttribute('aria-controls', 'scCelLegend');
    text(legendBtn, 'Legend');

    var legend = el('div', 'sc-cel__legend sc-is-collapsed', parent);
    legend.id = 'scCelLegend';
    var list = el('ul', 'sc-cel__legend-list', legend);
    var order = ['ready', 'blocked', 'explored', 'completed', 'survey', 'undiscovered'];
    for (var i = 0; i < order.length; i++) {
      var item = el('li', 'sc-cel__legend-item sc-state-' + order[i], list);
      var g = el('span', 'sc-cel__legend-glyph', item);
      g.setAttribute('aria-hidden', 'true');
      text(g, STATE[order[i]].glyph);
      text(el('span', null, item), legendText(order[i]));
    }
  }

  function legendText(key) {
    switch (key) {
      case 'ready': return 'Ready — enough fuel to go now';
      case 'blocked': return 'Reachable — not enough fuel yet';
      case 'explored': return 'Explored';
      case 'completed': return 'System conquered';
      case 'survey': return 'Survey only — nothing to explore';
      default: return 'Unsurveyed — not yet reached';
    }
  }

  function stat(parent, label, id) {
    var group = el('div', 'sc-cel__stat', parent);
    text(el('dt', 'sc-cel__stat-label', group), label);
    var dd = el('dd', 'sc-cel__stat-value', group);
    dd.id = id;
    return text(dd, '—');
  }

  /* ----------------------------------------------------------- orbital map -- */

  function buildOrbitalMap(parent) {
    var section = el('section', 'sc-cel__panel sc-cel__panel--orbit', parent);
    var heading = el('h3', 'sc-cel__panel-title', section);
    heading.id = 'scCelOrbitTitle';
    text(heading, 'Solar system');

    var frame = el('div', 'sc-cel__map', section);
    frame.setAttribute('role', 'group');
    frame.setAttribute('aria-labelledby', 'scCelOrbitTitle');
    var canvas = el('div', 'sc-cel__canvas', frame);
    canvas.id = 'scCelCanvas';
    canvas.style.width = MAP.width + 'px';
    canvas.style.height = MAP.height + 'px';

    /* Decorative instrumentation: orbit rings and a star. */
    var art = svg('svg', 'sc-cel__orbits', canvas);
    art.setAttribute('viewBox', '0 0 ' + MAP.width + ' ' + MAP.height);
    art.setAttribute('width', String(MAP.width));
    art.setAttribute('height', String(MAP.height));
    art.setAttribute('aria-hidden', 'true');
    art.setAttribute('focusable', 'false');

    var rings = [1, 2, 3];
    for (var r = 0; r < rings.length; r++) {
      var circle = svg('circle', 'sc-cel__orbit', art);
      circle.setAttribute('cx', String(MAP.cx));
      circle.setAttribute('cy', String(MAP.cy));
      circle.setAttribute('r', String(MAP.ringRadius[rings[r]]));
    }
    var sun = svg('circle', 'sc-cel__sun', art);
    sun.setAttribute('cx', String(MAP.cx));
    sun.setAttribute('cy', String(MAP.cy));
    sun.setAttribute('r', '26');

    /* Grouped by ring so the DOM reading order is also the mobile route. */
    var groups = {};
    var i;
    for (i = 0; i < model.solar.length; i++) {
      var ring = model.solar[i].ring;
      if (!groups[ring]) groups[ring] = [];
      groups[ring].push(model.solar[i]);
    }
    var ringIds = Object.keys(groups).sort();
    for (r = 0; r < ringIds.length; r++) {
      var ring = ringIds[r];
      var section2 = el('section', 'sc-cel__ring', canvas);
      section2.setAttribute('data-ring', ring);
      var t = el('h4', 'sc-cel__ring-title', section2);
      text(t, model.ringLabel[ring] || ('Ring ' + ring));
      var members = groups[ring];
      for (i = 0; i < members.length; i++) buildNode(members[i], section2, i, members.length);
    }
  }

  /** Polar placement: deterministic from ring and index. */
  function placeOnRing(ring, index, count) {
    /* The launch site is not an orbital body, so it is parked outside the
       orbits rather than squeezed between the star and the inner ring — where
       it used to overlap the Moon. */
    if (ring === 0 || count === 0) {
      return { x: 8, y: 8 + index * (MAP.node.h + 8) };
    }
    var radius = MAP.ringRadius[ring] || 0;
    var angle = ((MAP.ringStart[ring] || -90) + (360 / count) * index) * Math.PI / 180;
    return {
      x: Math.round(MAP.cx + radius * Math.cos(angle) - MAP.node.w / 2),
      y: Math.round(MAP.cy + radius * Math.sin(angle) - MAP.node.h / 2)
    };
  }

  function buildNode(node, parent, index, count) {
    var pos = placeOnRing(node.ring, index, count);
    var box = el('article', 'sc-cel-node', parent);
    box.id = node.domId;
    box.setAttribute('data-dest', keyOf(node));
    box.style.left = pos.x + 'px';
    box.style.top = pos.y + 'px';
    box.style.width = MAP.node.w + 'px';

    var view = { node: node, el: box };

    var select = el('button', 'sc-cel-node__select', box);
    select.type = 'button';
    select.setAttribute('data-select', keyOf(node));
    select.setAttribute('aria-pressed', 'false');
    view.select = select;

    var badge = el('span', 'sc-cel-node__badge', select);
    var glyph = el('span', 'sc-cel-node__glyph', badge);
    glyph.setAttribute('aria-hidden', 'true');
    view.glyph = text(glyph, '');
    view.badge = text(el('span', 'sc-cel-node__badge-text', badge), '');
    view.label = text(el('span', 'sc-cel-node__label', select), '');
    view.meta = text(el('span', 'sc-cel-node__meta', select), '');

    views.push(view);
    viewByKey[keyOf(node)] = view;
    return view;
  }

  /* ------------------------------------------------------------- starfield -- */

  function buildStarfield(parent) {
    var section = el('section', 'sc-cel__panel sc-cel__panel--stars', parent);
    section.id = 'scCelStarfield';
    var heading = el('h3', 'sc-cel__panel-title', section);
    heading.id = 'scCelStarTitle';
    text(heading, 'Interstellar network');

    var note = el('p', 'sc-cel__stars-note', section);
    note.id = 'scCelStarNote';
    text(note, '');

    var list = el('div', 'sc-cel__stars', section);
    list.setAttribute('role', 'group');
    list.setAttribute('aria-labelledby', 'scCelStarTitle');
    list.id = 'scCelStarList';

    for (var i = 0; i < model.stars.length; i++) {
      var node = model.stars[i];
      var box = el('article', 'sc-cel-star', list);
      box.id = node.domId;
      box.setAttribute('data-dest', keyOf(node));

      var view = { node: node, el: box };
      var select = el('button', 'sc-cel-star__select', box);
      select.type = 'button';
      select.setAttribute('data-select', keyOf(node));
      select.setAttribute('aria-pressed', 'false');
      view.select = select;

      var g = el('span', 'sc-cel-star__glyph', select);
      g.setAttribute('aria-hidden', 'true');
      view.glyph = text(g, '');
      view.label = text(el('span', 'sc-cel-star__label', select), '');
      view.meta = text(el('span', 'sc-cel-star__meta', select), '');

      views.push(view);
      viewByKey[keyOf(node)] = view;
    }
  }

  /* ------------------------------------------------------------- inspector -- */

  function buildInspector(parent) {
    var aside = el('aside', 'sc-cel__inspector', parent);
    aside.id = 'scCelInspector';
    aside.setAttribute('aria-live', 'off');

    var empty = el('div', 'sc-cel__empty', aside);
    empty.id = 'scCelEmpty';
    var eh = el('h3', 'sc-cel__panel-title', empty);
    text(eh, 'Next objective');
    var frontier = el('p', 'sc-cel__frontier', empty);
    frontier.id = 'scCelFrontier';
    var frontierText = text(frontier, '');
    text(el('p', 'sc-cel__hint', empty), 'Select a destination on the map for its full briefing.');

    var panel = el('div', 'sc-cel__panel-card sc-is-collapsed', aside);
    panel.id = 'scCelPanel';

    var state = el('span', 'sc-cel__panel-state', panel);
    var sg = el('span', null, state);
    sg.setAttribute('aria-hidden', 'true');

    var api = {
      empty: empty,
      frontierText: frontierText,
      panel: panel,
      stateEl: state,
      stateGlyph: text(sg, ''),
      stateLabel: text(el('span', null, state), ''),
      name: text(el('h3', 'sc-cel__panel-name', panel), ''),
      type: text(el('p', 'sc-cel__panel-type', panel), '')
    };

    var facts = el('dl', 'sc-cel__facts', panel);
    api.cost = fact(facts, 'Cost', 'scCelFactCost');
    api.held = fact(facts, 'You hold', 'scCelFactHeld');
    api.missing = fact(facts, 'Still needed', 'scCelFactMissing');
    api.route = fact(facts, 'Reached from', 'scCelFactRoute');
    api.distance = fact(facts, 'Distance', 'scCelFactDistance');
    api.faction = fact(facts, 'Faction', 'scCelFactFaction');

    api.reason = el('p', 'sc-cel__reason', panel);
    api.reasonText = text(api.reason, '');

    var act = el('button', 'sc-cel__act', panel);
    act.type = 'button';
    act.id = 'scCelAct';
    api.act = act;
    api.actLabel = text(act, '');

    var open = el('button', 'sc-cel__open', panel);
    open.type = 'button';
    open.id = 'scCelOpen';
    open.setAttribute('data-open', '');
    api.open = open;
    api.openLabel = text(open, 'Open legacy panel');

    return api;
  }

  function fact(parent, label, id) {
    var row = el('div', 'sc-cel__fact', parent);
    text(el('dt', null, row), label);
    var dd = el('dd', null, row);
    dd.id = id;
    return { row: row, value: text(dd, '—') };
  }

  /* ----------------------------------------------------------- rendering --- */

  function renderNode(view) {
    var node = view.node;
    var info = STATE[node.state] || STATE.undiscovered;
    var revealed = node.visibility === 'visible';
    var isSelected = keyOf(node) === selectedKey;
    var base = node.kind === 'star' ? 'sc-cel-star' : 'sc-cel-node';

    setClass(view.el, base + ' sc-state-' + node.state +
      (revealed ? ' sc-is-revealed' : ' sc-is-concealed') +
      (isSelected ? ' sc-is-selected' : ''));

    setText(view.glyph, info.glyph);
    setText(view.label, node.publicLabel);

    if (!revealed) {
      /* Concealed destinations offer nothing and must not be reachable by
         keyboard or exposed to assistive technology. */
      setAttr(view.select, 'tabindex', '-1');
      setAttr(view.select, 'aria-hidden', 'true');
      setAttr(view.select, 'aria-pressed', 'false');
      if (view.badge) setText(view.badge, '');
      setText(view.meta, '');
      return;
    }

    setAttr(view.select, 'tabindex', '0');
    setAttr(view.select, 'aria-hidden', 'false');
    setAttr(view.select, 'aria-pressed', isSelected ? 'true' : 'false');
    setAttr(view.select, 'aria-label', accessibleLabel(node));
    if (view.badge) setText(view.badge, info.label);

    if (node.kind === 'star') {
      setText(view.meta, node.distance + ' ly · ' + (node.publicFaction || 'Unaligned'));
    } else if (node.state === 'ready' || node.state === 'blocked') {
      setText(view.meta, node.costText ? node.costText + ' fuel' : info.label);
    } else {
      setText(view.meta, TYPE_LABEL[node.type] || '');
    }
  }

  function accessibleLabel(node) {
    var info = STATE[node.state] || STATE.undiscovered;
    var parts = [node.publicLabel, TYPE_LABEL[node.type] || 'Destination', info.label];
    if (node.kind === 'star') parts.push(node.distance + ' light years');
    else if (node.costText && node.actionable) parts.push('costs ' + node.costText + ' rocket fuel');
    return parts.join(', ');
  }

  function renderHeader() {
    var s = model.stats;
    var api = window.SpaceCompanyCelestialModel;
    setText(head.region, s.region);
    setText(head.fuel, api.formatNumber(api.rocketFuel()));
    setText(head.reachable, String(s.solarReady));
    setText(head.explored, s.solarExplored + ' / ' + countExplorable());
    setText(head.systems, s.interstellarUnlocked
      ? (s.starsExplored + ' explored · ' + s.starsOwned + ' held')
      : 'Not yet reached');

    var field = document.getElementById('scCelStarfield');
    setClass(field, 'sc-cel__panel sc-cel__panel--stars' +
      (s.starsDiscovered ? '' : ' sc-is-dormant'));

    var note = document.getElementById('scCelStarNote');
    if (note && note.firstChild) {
      var range = model.range;
      setText(note.firstChild, s.starsDiscovered
        ? (s.starsDiscovered + ' of ' + s.starsTotal + ' systems within telescope range' +
           (model.interstellarRocketBuilt ? '' : ' · interstellar rocket required to travel'))
        : (range
          ? 'No systems in range yet — extend telescope reach to discover them.'
          : 'Interstellar operations are not yet available.'));
    }
  }

  function countExplorable() {
    var n = 0;
    for (var i = 0; i < model.solar.length; i++) {
      if (model.solar[i].actionTarget) n++;
    }
    return n;
  }

  function renderFrontier() {
    var f = model.frontier;
    if (!inspector) return;
    setText(inspector.frontierText, f && f.visibility === 'visible'
      ? f.publicLabel + (f.costText ? ' — ' + f.costText + (f.kind === 'star' ? ' antimatter' : ' rocket fuel') : '')
      : 'Nothing is actionable right now.');
  }

  function renderInspector() {
    if (!inspector) return;
    var node = selectedKey ? findNode(selectedKey) : null;

    if (!node || node.visibility !== 'visible') {
      setClass(inspector.panel, 'sc-cel__panel-card sc-is-collapsed');
      setClass(inspector.empty, 'sc-cel__empty');
      renderFrontier();
      return;
    }
    setClass(inspector.panel, 'sc-cel__panel-card');
    setClass(inspector.empty, 'sc-cel__empty sc-is-collapsed');

    var info = STATE[node.state] || STATE.undiscovered;
    setClass(inspector.stateEl, 'sc-cel__panel-state sc-state-' + node.state);
    setText(inspector.stateGlyph, info.glyph);
    setText(inspector.stateLabel, info.label);
    setText(inspector.name, node.publicLabel);
    setText(inspector.type, TYPE_LABEL[node.type] || 'Destination');

    var api = window.SpaceCompanyCelestialModel;
    show(inspector.cost, node.publicCostText,
      node.publicCostText + (node.kind === 'star' ? ' antimatter' : ' rocket fuel'));
    show(inspector.held, true, node.kind === 'star'
      ? api.formatNumber(api.antimatter()) + ' antimatter'
      : api.formatNumber(api.rocketFuel()) + ' rocket fuel');
    show(inspector.missing, node.kind !== 'star' && node.missing > 0,
      api.formatNumber(node.missing) + ' rocket fuel');
    show(inspector.route, node.kind !== 'star' && node.parent,
      routeLabel(node));
    show(inspector.distance, node.kind === 'star', node.distance + ' light years');
    show(inspector.faction, node.kind === 'star' && node.publicFaction, node.publicFaction);

    var reason = unavailableReason(node);
    setText(inspector.reasonText, reason || '');
    setClass(inspector.reason, reason ? 'sc-cel__reason' : 'sc-cel__reason sc-is-collapsed');

    if (node.actionable) {
      setClass(inspector.act, 'sc-cel__act');
      setAttr(inspector.act, 'data-act', keyOf(node));
      setText(inspector.actLabel, node.kind === 'star'
        ? 'Explore system' : 'Explore ' + node.publicLabel);
      inspector.act.disabled = false;
      setAttr(inspector.act, 'aria-disabled', 'false');
    } else {
      setClass(inspector.act, 'sc-cel__act sc-is-collapsed');
      inspector.act.removeAttribute('data-act');
      inspector.act.disabled = true;
    }

    setAttr(inspector.open, 'data-open', keyOf(node));
    setText(inspector.openLabel, node.kind === 'star'
      ? 'Open interstellar panel' : 'Open ' + node.publicLabel + ' panel');
  }

  function show(entry, condition, value) {
    if (condition) {
      setClass(entry.row, 'sc-cel__fact');
      setText(entry.value, String(value));
    } else {
      setClass(entry.row, 'sc-cel__fact sc-is-collapsed');
    }
  }

  function routeLabel(node) {
    var parent = model.solarByKey[node.parent];
    if (!parent) return '—';
    if (parent.visibility === 'visible') return parent.publicLabel;
    return 'Not yet surveyed';
  }

  /** Why the player cannot act — stated from canonical state, never guessed. */
  function unavailableReason(node) {
    if (node.actionable) return null;
    if (node.kind === 'star') {
      if (node.owned) return 'This system is already under your control.';
      if (node.explored) return 'Already explored — conquest is handled in the interstellar panel.';
      if (!node.rocketBuilt) return 'Requires a Tier 1 interstellar rocket before travel is possible.';
      return null;
    }
    if (node.surveyOnly) return 'Survey only: the mission log records nothing worth exploring here.';
    if (node.state === 'explored') return 'Already explored.';
    if (node.id === 'spaceRocket') return 'Build and launch from the launch panel.';
    return null;
  }

  function findNode(key) {
    for (var i = 0; i < model.all.length; i++) {
      if (keyOf(model.all[i]) === key) return model.all[i];
    }
    return null;
  }

  function renderAll() {
    for (var i = 0; i < views.length; i++) {
      views[i].node = findNode(keyOf(views[i].node)) || views[i].node;
      renderNode(views[i]);
    }
    renderHeader();
    renderInspector();
  }

  /* --------------------------------------------------------- interaction -- */

  function closest(node, attribute) {
    while (node && node !== root) {
      if (node.getAttribute && node.getAttribute(attribute) !== null &&
          node.getAttribute(attribute) !== '') return node;
      node = node.parentNode;
    }
    return null;
  }

  function onClick(event) {
    var target = event.target;

    var act = closest(target, 'data-act');
    if (act && !act.disabled) { performAction(act.getAttribute('data-act')); return; }

    var open = closest(target, 'data-open');
    if (open) { selectDestination(open.getAttribute('data-open'), true); return; }

    var select = closest(target, 'data-select');
    if (select) {
      var key = select.getAttribute('data-select');
      selectDestination(key === selectedKey ? null : key, key !== selectedKey);
      return;
    }

    var action = closest(target, 'data-action');
    if (!action) return;
    if (action.getAttribute('data-action') === 'focus') focusFrontier(true);
    else if (action.getAttribute('data-action') === 'legend') toggleLegend(action);
  }

  function toggleLegend(button) {
    var legend = document.getElementById('scCelLegend');
    if (!legend) return;
    var open = legend.className.indexOf('sc-is-collapsed') === -1;
    setClass(legend, 'sc-cel__legend' + (open ? ' sc-is-collapsed' : ''));
    setAttr(button, 'aria-expanded', open ? 'false' : 'true');
  }

  /**
   * Selection delegates to the legacy row so BOTH `activeSolarTab(...)` and
   * Bootstrap's tab data-api run exactly as they do for a legacy click. The
   * modern selection is then re-read from the row, never assigned ahead of it.
   */
  function selectDestination(key, dispatch) {
    selectedKey = key;
    if (key && dispatch) {
      var node = findNode(key);
      if (node && node.visibility === 'visible' && node.kind === 'solar') {
        var row = document.getElementById(node.rowId);
        if (row && typeof row.click === 'function') row.click();
        else if (window.jQuery && row) window.jQuery(row).trigger('click');
      }
    }
    refresh(true);
  }

  /**
   * The ONE and only celestial action path.
   *
   *   solar → click the legacy `<button onclick="explore('X')">`
   *   star  → click the legacy `#star_<id>_explore` control
   *
   * Never the underlying function as well, never twice; `dispatching` closes
   * the window in which the synchronous re-render could re-enter.
   */
  var dispatching = false;

  function performAction(key) {
    if (dispatching || !key) return false;
    var node = findNode(key);
    if (!node || !node.actionable || node.visibility !== 'visible') return false;

    dispatching = true;
    try {
      var control = node.kind === 'star'
        ? document.getElementById(node.actionId)
        : firstButton(document.getElementById(node.exploreRowId));
      if (!control || typeof control.click !== 'function') return false;
      control.click();
    } finally {
      dispatching = false;
    }

    refresh(true);
    return true;
  }

  /* ------------------------------------------------------------- focusing -- */

  function focusFrontier(userInitiated) {
    if (!root) return;
    var pathMode = root.getAttribute('data-layout') !== MODE_MAP;
    if (pathMode && !userInitiated) return;

    var target = model.frontier;
    if (!target || target.visibility !== 'visible') return;

    selectedKey = keyOf(target);
    renderAll();

    var box = document.getElementById(target.domId);
    if (!pathMode) {
      /* Scroll the map container only. `scrollIntoView` would move the PAGE and
         push the command-center header off screen, which is never what "focus
         the next objective" should do on desktop. */
      var frame = box && box.parentNode ? closestScrollable(box) : null;
      if (frame && box && frame.scrollWidth > frame.clientWidth + 1) {
        frame.scrollLeft = clamp(box.offsetLeft + box.offsetWidth / 2 - frame.clientWidth / 2,
          0, frame.scrollWidth - frame.clientWidth);
      }
      if (frame && box && frame.scrollHeight > frame.clientHeight + 1) {
        frame.scrollTop = clamp(box.offsetTop + box.offsetHeight / 2 - frame.clientHeight / 2,
          0, frame.scrollHeight - frame.clientHeight);
      }
    } else if (box && typeof box.scrollIntoView === 'function') {
      box.scrollIntoView({
        block: 'center',
        behavior: prefersReducedMotion() ? 'auto' : 'smooth'
      });
    }
    if (userInitiated) {
      var view = viewByKey[keyOf(target)];
      if (view && view.select && typeof view.select.focus === 'function') view.select.focus();
    }
  }

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  /** Nearest ancestor that actually scrolls, bounded by the component root. */
  function closestScrollable(node) {
    var el = node.parentNode;
    while (el && el !== root) {
      if (el.className && String(el.className).indexOf('sc-cel__map') !== -1) return el;
      if (el.className && String(el.className).indexOf('sc-cel__stars') !== -1) return el;
      el = el.parentNode;
    }
    return null;
  }

  function focusWhenVisible() {
    if (focusedOnce || !root) return;
    var canvas = document.getElementById('scCelCanvas');
    if (!canvas || !canvas.clientWidth) return;
    focusedOnce = true;
    focusFrontier(false);
  }

  /* ------------------------------------------------------------ responsive -- */

  function bindBreakpoint() {
    if (!window.matchMedia) return;
    try { mediaQuery = window.matchMedia(PATH_BREAKPOINT); } catch (e) { return; }
    applyBreakpoint(mediaQuery);
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', applyBreakpoint);
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(applyBreakpoint);
    }
  }

  function applyBreakpoint(query) {
    if (!root) return;
    var next = query && query.matches ? 'route' : MODE_MAP;
    if (root.getAttribute('data-layout') !== next) root.setAttribute('data-layout', next);
  }

  /* ---------------------------------------------------------------- cadence -- */

  function refresh(force) {
    focusWhenVisible();
    var api = window.SpaceCompanyCelestialModel;
    var next = api.signature();
    if (force || next !== signature) {
      signature = next;
      var rebuilt = api.build();
      if (!rebuilt) return;
      model = rebuilt;
      renderAll();
      renderFrontier();
      return;
    }
    refreshCheap();
  }

  /** Fuel/antimatter move constantly; structure rarely does. */
  var lastFuel = null;
  function refreshCheap() {
    var api = window.SpaceCompanyCelestialModel;
    var fuel = api.rocketFuel();
    if (fuel === lastFuel) return;
    lastFuel = fuel;

    var changed = false;
    for (var i = 0; i < model.solar.length; i++) {
      var node = model.solar[i];
      if (node.cost === null || node.visibility !== 'visible') continue;
      node.held = fuel;
      var affordable = fuel >= node.cost;
      node.missing = Math.max(0, node.cost - fuel);
      if (node.affordable !== affordable) {
        node.affordable = affordable;
        if (node.state === 'ready' || node.state === 'blocked') {
          node.state = affordable ? 'ready' : 'blocked';
          renderNode(viewByKey[keyOf(node)]);
          changed = true;
        }
      }
    }
    if (changed) {
      model.stats.solarReady = 0;
      for (i = 0; i < model.solar.length; i++) {
        if (model.solar[i].state === 'ready') model.stats.solarReady++;
      }
      model.frontier = null;
    }
    renderHeader();
    if (selectedKey) renderInspector();
  }

  /* -------------------------------------------------------------- register -- */

  var component = {
    initialise: function () {
      if (mode !== MODE_MAP || built) return;
      try {
        built = build();
        if (built) { renderAll(); renderFrontier(); focusWhenVisible(); }
      } catch (error) {
        built = false;
        teardown();
        console.error('Celestial command center failed to initialise; legacy panes retained.', error);
      }
    },
    update: function () {
      if (!built) return;
      try { refresh(false); } catch (error) {
        console.error('Celestial command center refresh failed.', error);
      }
    }
  };

  function teardown() {
    if (root && root.parentNode) root.parentNode.removeChild(root);
    root = null; model = null; views = []; viewByKey = Object.create(null);
    inspector = null; head = null; selectedKey = null;
  }

  if (window.Game && window.Game.uiComponents) window.Game.uiComponents.push(component);

  window.SpaceCompanyCelestial = {
    mode: mode,
    version: 'm4',
    isMap: mode === MODE_MAP,
    component: component,
    getModel: function () { return model; },
    getSelection: function () { return selectedKey; },
    select: function (key) { selectDestination(key || null, false); return selectedKey; },
    act: performAction,
    focusFrontier: focusFrontier
  };
})();
