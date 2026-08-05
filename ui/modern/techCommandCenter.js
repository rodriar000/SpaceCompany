/* ============================================================================
 * Space Company — Research Command Center (first-party, M3)
 *
 * Renders the technology map inside `#technologiesTab`, over the read-only
 * projection built by `ui/modern/techGraph.js`.
 *
 * DESIGN: the map is a VIEW, the legacy table is still the machinery
 * -----------------------------------------------------------------------------
 * `#techTable` and its `<tr id="<techId>">` rows stay in the document with every
 * id, class, handler and data binding intact. `refreshResearches()`,
 * `science.js`'s four `update*Display()` passes and `solCenter.js` keep writing
 * to them exactly as before — several of those writes are unguarded
 * `getElementById(...).className = ...` calls that would throw if the rows were
 * removed. Modern CSS merely hides the table while this view exists.
 *
 * Researching dispatches a real click on the legacy
 * `<button onclick="purchaseTech('<id>')">`, so the canonical path runs once and
 * unchanged: `buyTech` -> `spendResources` -> `gainTech` -> `apply`/`onApply`
 * -> statistics -> `refreshResources`/`refreshResearches`/`refreshTabs` ->
 * `newUnlock` -> `Game.notifySuccess`. This file never spends science, never
 * calls `apply`, and never writes `unlocked`/`current`.
 *
 * PERFORMANCE: the DOM is built EXACTLY ONCE. Node geometry comes from the
 * graph's deterministic layout and is independent of state and of viewport, so
 * progress never re-creates an element, never re-binds a listener and never
 * re-runs layout. Per-tick work is a diffed text/class refresh.
 *
 * HARD CONSTRAINTS (see docs/UI_DOM_CONTRACT.md, docs/M3_TECHNOLOGY_CONTRACT.md):
 *   - never reads or writes localStorage (not even a preference key)
 *   - never touches `localStorage["save"]`, the save object, or any gameplay global
 *   - never adds, removes or overrides the legacy `.hidden` class
 *   - selection is presentation-only and is never persisted
 *   - degrades safely: if anything throws, the legacy research table stays visible
 * ==========================================================================*/
(function () {
  'use strict';

  var MODE_GRAPH = 'graph';
  var MODE_LEGACY = 'legacy';

  var ROOT_ID = 'scTechCenter';
  var PATH_BREAKPOINT = '(max-width: 900px)';

  /* -- state (presentation only) -------------------------------------------- */
  var mode = resolveMode();
  var root = null;
  var built = false;
  var graph = null;
  var signature = '';
  var selectedId = null;
  var views = [];            // one entry per technology: { node, el, parts… }
  var viewById = Object.create(null);
  var connectorEls = Object.create(null);
  var inspector = null;
  var headStats = null;
  var mediaQuery = null;

  /** `?ui=legacy` or `?research=legacy` restores the original `#techTable`. */
  function resolveMode() {
    var search = (window.location && window.location.search) || '';
    return /[?&](?:ui|research)=legacy(?:&|$)/i.test(search) ? MODE_LEGACY : MODE_GRAPH;
  }

  function prefersReducedMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) {
      return false;
    }
  }

  /* ========================================================================= *
   * Tiny DOM helpers
   * ========================================================================= */

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

  function setText(node, value) {
    if (node && node.nodeValue !== value) node.nodeValue = value;
  }

  function setClass(node, value) {
    if (node && node.className !== value) node.className = value;
  }

  function setAttr(node, name, value) {
    if (!node) return;
    if (node.getAttribute(name) !== value) node.setAttribute(name, value);
  }

  function svg(tag, className, parent) {
    var node = document.createElementNS
      ? document.createElementNS('http://www.w3.org/2000/svg', tag)
      : document.createElement(tag);
    if (className) node.setAttribute('class', className);
    if (parent) parent.appendChild(node);
    return node;
  }

  /* ========================================================================= *
   * State vocabulary — every state carries a glyph AND a word, never colour alone
   * ========================================================================= */

  var STATE = {
    researched:   { glyph: '✓', label: 'Researched' },
    maxed:        { glyph: '✦', label: 'Fully researched' },
    progressing:  { glyph: '↻', label: 'In progress' },
    ready:        { glyph: '▶', label: 'Ready to research' },
    blocked:      { glyph: '✕', label: 'Not enough science' },
    preview:      { glyph: '◈', label: 'Undiscovered' },
    undiscovered: { glyph: '◇', label: 'Undiscovered' }
  };

  var TYPE_LABEL = {
    unlock: 'Unlock',
    upgrade: 'Upgrade',
    levelled: 'Levelled upgrade',
    repeatable: 'Repeatable'
  };

  function isRevealed(node) {
    return node.visibility === 'visible';
  }

  /* ========================================================================= *
   * Build — runs once
   * ========================================================================= */

  function build() {
    var pane = document.getElementById('technologiesTab');
    if (!pane || document.getElementById(ROOT_ID)) return false;

    var api = window.SpaceCompanyTechGraph;
    if (!api) return false;
    graph = api.build();
    if (!graph || !graph.nodes.length) return false;
    signature = api.structureSignature();

    root = el('div', 'sc-tech');
    root.id = ROOT_ID;
    root.setAttribute('data-layout', MODE_GRAPH);

    buildHeader(root);

    var body = el('div', 'sc-tech__body', root);
    var viewport = el('div', 'sc-tech__viewport', body);
    viewport.id = 'scTechViewport';
    viewport.setAttribute('role', 'group');
    viewport.setAttribute('aria-label', 'Technology map');

    var canvas = el('div', 'sc-tech__canvas', viewport);
    canvas.id = 'scTechCanvas';
    canvas.style.width = graph.layout.canvas.width + 'px';
    canvas.style.height = graph.layout.canvas.height + 'px';

    buildWires(canvas);
    buildLaneLabels(canvas);
    buildStageColumns(canvas);
    buildNodes(canvas);

    inspector = buildInspector(body);

    /* Exactly two delegated listeners for the whole map. */
    root.addEventListener('click', onClick, false);

    pane.insertBefore(root, pane.firstChild);

    bindBreakpoint();
    return true;
  }

  function buildHeader(parent) {
    var head = el('header', 'sc-tech__head', parent);

    var lead = el('div', 'sc-tech__lead', head);
    var title = el('h2', 'sc-tech__title', lead);
    text(title, 'Technology Command Center');
    var sub = el('p', 'sc-tech__sub', lead);
    text(sub, 'Progression flows left to right. Select a technology for its full briefing.');

    var stats = el('dl', 'sc-tech__stats', head);
    headStats = {
      science: stat(stats, 'Science', 'scTechScience'),
      researched: stat(stats, 'Researched', 'scTechResearched'),
      available: stat(stats, 'Available', 'scTechAvailable'),
      affordable: stat(stats, 'Affordable now', 'scTechAffordable')
    };

    var meterWrap = el('div', 'sc-tech__meter', head);
    meterWrap.id = 'scTechMeter';
    meterWrap.setAttribute('role', 'img');
    headStats.fill = el('span', 'sc-tech__meter-fill', meterWrap);

    var actions = el('div', 'sc-tech__actions', head);

    var focus = el('button', 'sc-tech__btn', actions);
    focus.id = 'scTechFocus';
    focus.type = 'button';
    focus.setAttribute('data-action', 'focus');
    text(focus, 'Focus frontier');

    var legendBtn = el('button', 'sc-tech__btn', actions);
    legendBtn.id = 'scTechLegendToggle';
    legendBtn.type = 'button';
    legendBtn.setAttribute('data-action', 'legend');
    legendBtn.setAttribute('aria-expanded', 'false');
    legendBtn.setAttribute('aria-controls', 'scTechLegend');
    text(legendBtn, 'Legend');

    buildLegend(parent);
  }

  function stat(parent, label, id) {
    var group = el('div', 'sc-tech__stat', parent);
    var dt = el('dt', 'sc-tech__stat-label', group);
    text(dt, label);
    var dd = el('dd', 'sc-tech__stat-value', group);
    dd.id = id;
    return text(dd, '—');
  }

  function buildLegend(parent) {
    var legend = el('div', 'sc-tech__legend sc-is-collapsed', parent);
    legend.id = 'scTechLegend';
    var list = el('ul', 'sc-tech__legend-list', legend);
    var order = ['ready', 'blocked', 'progressing', 'researched', 'maxed', 'preview', 'undiscovered'];
    var seen = {};
    for (var i = 0; i < order.length; i++) {
      var key = order[i];
      if (seen[STATE[key].label] && key === 'undiscovered') continue;
      seen[STATE[key].label] = true;
      var item = el('li', 'sc-tech__legend-item sc-state-' + key, list);
      var glyph = el('span', 'sc-tech__legend-glyph', item);
      glyph.setAttribute('aria-hidden', 'true');
      text(glyph, STATE[key].glyph);
      text(el('span', 'sc-tech__legend-text', item), legendText(key));
    }
  }

  function legendText(key) {
    switch (key) {
      case 'ready': return 'Ready — you can afford it now';
      case 'blocked': return 'Available — not enough science yet';
      case 'progressing': return 'Owned and still upgradable';
      case 'researched': return 'Researched';
      case 'maxed': return 'Fully researched — no levels left';
      case 'preview': return 'Undiscovered — directly ahead of you';
      default: return 'Undiscovered — further out';
    }
  }

  /** Connectors + lane bands. Decorative: hidden from assistive technology. */
  function buildWires(canvas) {
    var wires = svg('svg', 'sc-tech__wires', canvas);
    wires.setAttribute('width', String(graph.layout.canvas.width));
    wires.setAttribute('height', String(graph.layout.canvas.height));
    wires.setAttribute('viewBox', '0 0 ' + graph.layout.canvas.width + ' ' + graph.layout.canvas.height);
    wires.setAttribute('aria-hidden', 'true');
    wires.setAttribute('focusable', 'false');

    var bandGroup = svg('g', 'sc-tech__bands', wires);
    var i;
    for (i = 0; i < graph.layout.bands.length; i++) {
      var band = graph.layout.bands[i];
      var rect = svg('rect', 'sc-tech__band', bandGroup);
      rect.setAttribute('x', String(band.x));
      rect.setAttribute('y', String(band.y));
      rect.setAttribute('width', String(band.width));
      rect.setAttribute('height', String(band.height));
      rect.setAttribute('rx', '14');
      rect.setAttribute('data-lane', band.key);
    }

    var edgeGroup = svg('g', 'sc-tech__edges', wires);
    for (i = 0; i < graph.connectors.length; i++) {
      var connector = graph.connectors[i];
      var path = svg('path', 'sc-tech__edge', edgeGroup);
      path.setAttribute('d', connector.path);
      path.setAttribute('data-from', connector.from);
      path.setAttribute('data-to', connector.to);

      var head = svg('path', 'sc-tech__edge-head', edgeGroup);
      head.setAttribute('d', connector.head);
      head.setAttribute('data-from', connector.from);
      head.setAttribute('data-to', connector.to);

      connectorEls[connector.from + '>' + connector.to] = { path: path, head: head };
    }
  }

  function buildLaneLabels(canvas) {
    var wrap = el('div', 'sc-tech__lanes', canvas);
    wrap.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < graph.layout.bands.length; i++) {
      var band = graph.layout.bands[i];
      var label = el('span', 'sc-tech__lane-label', wrap);
      label.style.top = (band.y - 24) + 'px';
      label.style.left = band.x + 'px';
      text(label, band.title);
    }
  }

  function buildStageColumns(canvas) {
    var wrap = el('div', 'sc-tech__columns', canvas);
    wrap.setAttribute('aria-hidden', 'true');
    var cell = graph.layout.cell;
    for (var c = 0; c < graph.layout.canvas.columns; c++) {
      var label = el('span', 'sc-tech__column-label', wrap);
      label.style.left = (cell.padX + c * (cell.width + cell.colGap)) + 'px';
      label.style.width = cell.width + 'px';
      text(label, 'Stage ' + (c + 1));
    }
  }

  /**
   * Nodes are grouped into `<section>` per stage. In map mode the sections are
   * `display:contents`, so the absolutely-positioned nodes lay out against the
   * canvas while the DOM keeps a sane stage-by-stage reading order; in pathway
   * mode the same sections become the vertical progression stages.
   */
  function buildNodes(canvas) {
    var stages = [];
    var i;
    for (i = 0; i < graph.nodes.length; i++) {
      var depth = graph.nodes[i].depth;
      if (!stages[depth]) stages[depth] = [];
      stages[depth].push(graph.nodes[i]);
    }

    for (var d = 0; d < stages.length; d++) {
      if (!stages[d]) continue;
      var section = el('section', 'sc-tech__stage', canvas);
      section.setAttribute('data-depth', String(d));
      var heading = el('h3', 'sc-tech__stage-title', section);
      text(heading, 'Stage ' + (d + 1));

      for (i = 0; i < stages[d].length; i++) buildNode(stages[d][i], section);
    }
  }

  function buildNode(node, parent) {
    var box = el('article', 'sc-tech-node', parent);
    box.id = 'scTech-' + node.id;
    box.setAttribute('data-tech', node.id);
    box.setAttribute('data-lane', node.lane);
    box.style.left = node.x + 'px';
    box.style.top = node.y + 'px';
    box.style.width = node.w + 'px';
    box.style.height = node.h + 'px';

    var view = { node: node, el: box, revealed: null };

    /* --- concealed nodes: a shape and a position, never a name or a cost --- */
    var fog = el('div', 'sc-tech-node__fog', box);
    var fogGlyph = el('span', 'sc-tech-node__fog-glyph', fog);
    fogGlyph.setAttribute('aria-hidden', 'true');
    view.fogGlyph = text(fogGlyph, STATE.undiscovered.glyph);
    view.fogLabel = text(el('span', 'sc-tech-node__fog-label', fog), 'Undiscovered');

    /* --- revealed nodes ---------------------------------------------------- */
    var select = el('button', 'sc-tech-node__select', box);
    select.type = 'button';
    select.setAttribute('data-select', node.id);
    select.setAttribute('aria-pressed', 'false');
    view.select = select;

    var badge = el('span', 'sc-tech-node__badge', select);
    var badgeGlyph = el('span', 'sc-tech-node__badge-glyph', badge);
    badgeGlyph.setAttribute('aria-hidden', 'true');
    view.badgeGlyph = text(badgeGlyph, '');
    view.badgeLabel = text(el('span', 'sc-tech-node__badge-text', badge), '');

    view.name = text(el('span', 'sc-tech-node__name', select), '');

    var meta = el('span', 'sc-tech-node__meta', select);
    view.type = text(el('span', 'sc-tech-node__type', meta), '');
    view.level = text(el('span', 'sc-tech-node__level', meta), '');

    var cost = el('span', 'sc-tech-node__cost', select);
    view.costEl = cost;
    var costGlyph = el('span', 'sc-tech-node__cost-glyph', cost);
    costGlyph.setAttribute('aria-hidden', 'true');
    view.costGlyph = text(costGlyph, '◈');
    view.cost = text(el('span', 'sc-tech-node__cost-value', cost), '');

    var buy = el('button', 'sc-tech-node__buy', box);
    buy.type = 'button';
    buy.setAttribute('data-buy', node.id);
    view.buy = buy;
    view.buyLabel = text(buy, 'Research');

    views.push(view);
    viewById[node.id] = view;
    return view;
  }

  /* ========================================================================= *
   * Inspector
   * ========================================================================= */

  function buildInspector(parent) {
    var aside = el('aside', 'sc-tech__inspector', parent);
    aside.id = 'scTechInspector';
    aside.setAttribute('aria-live', 'off');
    aside.setAttribute('aria-label', 'Technology briefing');

    /* With nothing selected the panel would be an empty 340px column, so it
       doubles as the frontier readout: what is researchable right now, cheapest
       first. Read-only text — the map keeps the actions. */
    var empty = el('div', 'sc-tech__inspector-empty', aside);
    empty.id = 'scTechInspectorEmpty';
    var emptyTitle = el('h3', 'sc-tech__panel-heading', empty);
    text(emptyTitle, 'Ready to research');
    var frontierList = el('ul', 'sc-tech__frontier', empty);
    var hint = el('p', 'sc-tech__inspector-hint', empty);
    text(hint, 'Select a technology on the map to read its full briefing.');

    var panel = el('div', 'sc-tech__panel sc-is-collapsed', aside);
    panel.id = 'scTechPanel';

    var head = el('div', 'sc-tech__panel-head', panel);
    var state = el('span', 'sc-tech__panel-state', head);
    var stateGlyph = el('span', 'sc-tech__panel-state-glyph', state);
    stateGlyph.setAttribute('aria-hidden', 'true');

    var api = {
      root: aside,
      empty: empty,
      frontierList: frontierList,
      panel: panel,
      stateEl: state,
      stateGlyph: text(stateGlyph, ''),
      stateLabel: text(el('span', null, state), ''),
      name: text(el('h3', 'sc-tech__panel-name', head), ''),
      type: text(el('p', 'sc-tech__panel-type', head), ''),
      desc: text(el('p', 'sc-tech__panel-desc', panel), '')
    };

    var facts = el('dl', 'sc-tech__facts', panel);
    api.cost = fact(facts, 'Science cost', 'scTechFactCost');
    api.have = fact(facts, 'Science held', 'scTechFactHave');
    api.missing = fact(facts, 'Still needed', 'scTechFactMissing');
    api.missingRow = api.missing.row;
    api.level = fact(facts, 'Level', 'scTechFactLevel');
    api.levelRow = api.level.row;

    api.prereqTitle = el('h4', 'sc-tech__panel-heading', panel);
    text(api.prereqTitle, 'Prerequisites');
    api.prereqList = el('ul', 'sc-tech__prereqs', panel);

    api.effectsTitle = el('h4', 'sc-tech__panel-heading', panel);
    text(api.effectsTitle, 'Effects');
    api.effectsList = el('ul', 'sc-tech__effects', panel);

    api.noteEl = el('p', 'sc-tech__panel-note', panel);
    api.note = text(api.noteEl, '');

    var buy = el('button', 'sc-tech__panel-buy', panel);
    buy.type = 'button';
    buy.id = 'scTechPanelBuy';
    api.buy = buy;
    api.buyLabel = text(buy, 'Research');

    return api;
  }

  function fact(parent, label, id) {
    var row = el('div', 'sc-tech__fact', parent);
    text(el('dt', null, row), label);
    var dd = el('dd', null, row);
    dd.id = id;
    return { row: row, value: text(dd, '—') };
  }

  /* ========================================================================= *
   * Rendering — diffed; never creates or destroys an element
   * ========================================================================= */

  function renderNode(view) {
    var node = view.node;
    var revealed = isRevealed(node);
    var info = STATE[node.state] || STATE.undiscovered;

    setClass(view.el, 'sc-tech-node sc-state-' + node.state +
      (revealed ? ' sc-is-revealed' : ' sc-is-concealed') +
      (node.id === selectedId ? ' sc-is-selected' : '') +
      (node.externalUnlock ? ' sc-has-external' : ''));

    if (!revealed) {
      setText(view.fogGlyph, info.glyph);
      setText(view.fogLabel, node.state === 'preview' ? 'Undiscovered · next' : 'Undiscovered');
      /* A concealed node offers no action, so it is not a control: keeping it
         out of the tab order keeps keyboard traversal on real technology, and
         keeping it out of the accessibility tree keeps the concealment honest
         for screen-reader users too. */
      setAttr(view.el, 'data-concealed', 'true');
      disable(view.buy, true);
      setAttr(view.buy, 'tabindex', '-1');
      setAttr(view.buy, 'aria-hidden', 'true');
      setAttr(view.select, 'tabindex', '-1');
      setAttr(view.select, 'aria-hidden', 'true');
      return;
    }

    setAttr(view.el, 'data-concealed', 'false');
    setAttr(view.select, 'tabindex', '0');
    setAttr(view.select, 'aria-hidden', 'false');
    setAttr(view.select, 'aria-pressed', node.id === selectedId ? 'true' : 'false');
    setAttr(view.select, 'aria-label', accessibleLabel(node));

    setText(view.badgeGlyph, info.glyph);
    setText(view.badgeLabel, info.label);
    setText(view.name, node.publicName);
    setText(view.type, TYPE_LABEL[node.type] || 'Technology');
    setText(view.level, node.publicLevel ? ' · ' + node.publicLevel : '');

    /* The bottom line carries the price while a technology is still buyable and
       its headline effect once it is not, so completed research stays on the
       map as a legible record of what it bought rather than as dead space. */
    setClass(view.costEl, 'sc-tech-node__cost' +
      (node.actionable ? (node.affordable ? ' sc-is-affordable' : ' sc-is-short') : ' sc-is-done'));
    if (node.actionable) {
      setText(view.costGlyph, '◈');
      setText(view.cost, node.publicCostText + ' science');
    } else {
      setText(view.costGlyph, '›');
      setText(view.cost, node.publicEffects.length ? node.publicEffects[0] : 'No further levels');
    }

    if (node.actionable) {
      setAttr(view.buy, 'aria-hidden', 'false');
      setAttr(view.buy, 'tabindex', '0');
      setText(view.buyLabel, node.affordable ? 'Research' : 'Need more science');
      disable(view.buy, !node.affordable);
      setAttr(view.buy, 'aria-label', (node.affordable ? 'Research ' : 'Not enough science to research ') +
        node.publicName + ', costs ' + node.publicCostText + ' science');
    } else {
      setAttr(view.buy, 'aria-hidden', 'true');
      setAttr(view.buy, 'tabindex', '-1');
      setText(view.buyLabel, 'Complete');
      disable(view.buy, true);
    }
  }

  function disable(button, value) {
    if (!button) return;
    if (button.disabled !== value) button.disabled = value;
    setAttr(button, 'aria-disabled', value ? 'true' : 'false');
  }

  function accessibleLabel(node) {
    var info = STATE[node.state] || STATE.undiscovered;
    var parts = [node.publicName, TYPE_LABEL[node.type] || 'Technology', info.label];
    if (node.publicLevel) parts.push(node.publicLevel);
    if (node.publicCost !== null) parts.push('costs ' + node.publicCostText + ' science');
    return parts.join(', ');
  }

  function renderConnectors() {
    for (var i = 0; i < graph.connectors.length; i++) {
      var connector = graph.connectors[i];
      var pair = connectorEls[connector.from + '>' + connector.to];
      if (!pair) continue;
      var from = graph.byId[connector.from];
      var to = graph.byId[connector.to];
      var status = from.purchased ? 'complete' : (isRevealed(from) ? 'active' : 'dormant');
      var highlighted = selectedId && (connector.from === selectedId || connector.to === selectedId);
      var modifiers = ' sc-edge-' + status +
        (isRevealed(to) ? ' sc-edge-open' : '') +
        (highlighted ? ' sc-is-highlighted' : '');
      if (pair.path.getAttribute('class') !== 'sc-tech__edge' + modifiers) {
        pair.path.setAttribute('class', 'sc-tech__edge' + modifiers);
        pair.head.setAttribute('class', 'sc-tech__edge-head' + modifiers);
      }
    }
  }

  function renderHeader() {
    var stats = graph.stats;
    setText(headStats.science, window.SpaceCompanyTechGraph.formatNumber(graph.science));
    setText(headStats.researched, stats.completed + ' / ' + stats.oneShot);
    setText(headStats.available, String(stats.available));
    setText(headStats.affordable, String(stats.affordable));

    var meter = document.getElementById('scTechMeter');
    if (meter) {
      headStats.fill.style.width = stats.percent + '%';
      setAttr(meter, 'aria-label',
        stats.percent + '% of one-time technologies researched (' +
        stats.completed + ' of ' + stats.oneShot + ')');
    }
  }

  function renderInspector() {
    if (!inspector) return;
    var node = selectedId ? graph.byId[selectedId] : null;

    if (!node || !isRevealed(node)) {
      setClass(inspector.panel, 'sc-tech__panel sc-is-collapsed');
      setClass(inspector.empty, 'sc-tech__inspector-empty');
      renderFrontierList();
      return;
    }
    setClass(inspector.panel, 'sc-tech__panel');
    setClass(inspector.empty, 'sc-tech__inspector-empty sc-is-collapsed');

    var info = STATE[node.state] || STATE.undiscovered;
    setClass(inspector.stateEl, 'sc-tech__panel-state sc-state-' + node.state);
    setText(inspector.stateGlyph, info.glyph);
    setText(inspector.stateLabel, info.label);
    setText(inspector.name, node.publicName);
    setText(inspector.type, TYPE_LABEL[node.type] || 'Technology');
    setText(inspector.desc, node.publicDesc);

    setText(inspector.cost.value, node.publicCost === null
      ? 'No further levels'
      : node.publicCostText + ' science');
    setText(inspector.have.value, window.SpaceCompanyTechGraph.formatNumber(graph.science));

    if (node.actionable && !node.affordable) {
      setClass(inspector.missingRow, 'sc-tech__fact');
      setText(inspector.missing.value,
        window.SpaceCompanyTechGraph.formatNumber(node.missing) + ' science');
    } else {
      setClass(inspector.missingRow, 'sc-tech__fact sc-is-collapsed');
    }

    if (node.publicLevel) {
      setClass(inspector.levelRow, 'sc-tech__fact');
      setText(inspector.level.value, node.publicLevel);
    } else {
      setClass(inspector.levelRow, 'sc-tech__fact sc-is-collapsed');
    }

    renderPrereqs(node);
    renderList(inspector.effectsList, node.publicEffects);
    setClass(inspector.effectsTitle, node.publicEffects.length
      ? 'sc-tech__panel-heading' : 'sc-tech__panel-heading sc-is-collapsed');

    setText(inspector.note, node.externalUnlockNote || '');
    setClass(inspector.noteEl, node.externalUnlockNote
      ? 'sc-tech__panel-note' : 'sc-tech__panel-note sc-is-collapsed');

    if (node.actionable) {
      setClass(inspector.buy, 'sc-tech__panel-buy');
      setAttr(inspector.buy, 'data-buy', node.id);
      setText(inspector.buyLabel, node.affordable
        ? node.actionLabel || 'Research'
        : 'Need ' + window.SpaceCompanyTechGraph.formatNumber(node.missing) + ' more science');
      disable(inspector.buy, !node.affordable);
    } else {
      setClass(inspector.buy, 'sc-tech__panel-buy sc-is-collapsed');
      inspector.buy.removeAttribute('data-buy');
      disable(inspector.buy, true);
    }
  }

  /** Affordable technologies, cheapest first — the "what next" readout. */
  function renderFrontierList() {
    var ready = [];
    for (var i = 0; i < graph.nodes.length; i++) {
      var node = graph.nodes[i];
      if (isRevealed(node) && node.actionable && node.affordable) ready.push(node);
    }
    ready.sort(function (a, b) {
      return a.cost - b.cost || (a.index - b.index);
    });

    var labels = [];
    for (i = 0; i < ready.length && i < 6; i++) {
      labels.push(ready[i].publicName + ' — ' + ready[i].publicCostText + ' science');
    }
    if (!labels.length) labels.push('Nothing is affordable yet — keep producing science.');
    renderList(inspector.frontierList, labels);
  }

  function renderPrereqs(node) {
    var list = inspector.prereqList;
    var labels = [];
    for (var i = 0; i < node.prerequisites.length; i++) {
      var parent = graph.byId[node.prerequisites[i]];
      if (!parent) continue;
      labels.push(isRevealed(parent)
        ? parent.publicName + ' — ' + (parent.purchased ? 'researched' : 'not yet researched')
        : 'Undiscovered technology');
    }
    if (!labels.length && node.externalUnlock) labels.push('No technology prerequisite');
    renderList(list, labels);
    setClass(inspector.prereqTitle, labels.length
      ? 'sc-tech__panel-heading' : 'sc-tech__panel-heading sc-is-collapsed');
  }

  /** Reuse existing `<li>` nodes so a re-render never churns the DOM. */
  function renderList(list, items) {
    var i;
    for (i = 0; i < items.length; i++) {
      var item = list.childNodes[i];
      if (!item) {
        item = el('li', null, list);
        text(item, '');
      }
      setClass(item, '');
      setText(item.firstChild, items[i]);
    }
    for (i = list.childNodes.length - 1; i >= items.length; i--) {
      setClass(list.childNodes[i], 'sc-is-collapsed');
      setText(list.childNodes[i].firstChild, '');
    }
  }

  function renderAll() {
    for (var i = 0; i < views.length; i++) renderNode(views[i]);
    renderConnectors();
    renderHeader();
    renderInspector();
  }

  /* ========================================================================= *
   * Interaction
   * ========================================================================= */

  function closest(node, attribute) {
    while (node && node !== root) {
      if (node.getAttribute && node.getAttribute(attribute)) return node;
      node = node.parentNode;
    }
    return null;
  }

  function onClick(event) {
    var target = event.target;

    var buy = closest(target, 'data-buy');
    if (buy && !buy.disabled) {
      research(buy.getAttribute('data-buy'));
      return;
    }

    var select = closest(target, 'data-select');
    if (select) {
      selectedId = select.getAttribute('data-select') === selectedId
        ? null
        : select.getAttribute('data-select');
      renderAll();
      return;
    }

    var action = closest(target, 'data-action');
    if (!action) return;
    if (action.getAttribute('data-action') === 'focus') focusFrontier(true);
    else if (action.getAttribute('data-action') === 'legend') toggleLegend(action);
  }

  function toggleLegend(button) {
    var legend = document.getElementById('scTechLegend');
    if (!legend) return;
    var open = legend.className.indexOf('sc-is-collapsed') === -1;
    setClass(legend, 'sc-tech__legend' + (open ? ' sc-is-collapsed' : ''));
    setAttr(button, 'aria-expanded', open ? 'false' : 'true');
  }

  /**
   * The ONE and only purchase path.
   *
   * Preference order:
   *   1. click the legacy `<button id="<id>Button" onclick="purchaseTech('<id>')">`
   *      so the canonical handler runs exactly as a legacy click would;
   *   2. otherwise call the global `purchaseTech(id)` directly.
   * Never both, and never re-entrantly — `dispatching` closes the window in
   * which a synchronous re-render could route a second call through here.
   */
  var dispatching = false;

  function research(id) {
    if (dispatching || !id) return false;
    var node = graph && graph.byId[id];
    if (!node || !node.actionable || !node.affordable) return false;

    dispatching = true;
    try {
      var legacyButton = document.getElementById(id + 'Button');
      if (legacyButton && typeof legacyButton.click === 'function') {
        legacyButton.click();
      } else if (typeof window.purchaseTech === 'function') {
        window.purchaseTech(id);
      } else {
        return false;
      }
    } finally {
      dispatching = false;
    }

    refresh(true);
    return true;
  }

  /**
   * Frame the whole ACTIONABLE region rather than centring one node.
   *
   * Centring a single technology reliably parked the viewport in a gutter —
   * the map is deliberately sparse, so the neighbourhood of one node is mostly
   * empty. Framing the bounding box of everything the player can act on lands
   * on the part of the map that is actually live, and clamping to the canvas
   * means the view never scrolls past the content into blank space.
   */
  function focusFrontier(userInitiated) {
    var viewport = document.getElementById('scTechViewport');
    if (!viewport) return;

    /* In pathway mode the frontier is reached by scrolling the PAGE. Doing that
       unprompted would drop the player into the middle of the list with the
       command-center header off screen, so the automatic pass is a no-op there
       and only the explicit control scrolls. */
    var pathMode = root.getAttribute('data-layout') !== MODE_GRAPH;
    if (pathMode && !userInitiated) return;

    var actionable = [];
    var i;
    for (i = 0; i < graph.nodes.length; i++) {
      if (graph.nodes[i].actionable) actionable.push(graph.nodes[i]);
    }
    /* Nothing to research: fall back to the newest thing discovered. */
    if (!actionable.length) {
      for (i = 0; i < graph.nodes.length; i++) {
        if (isRevealed(graph.nodes[i])) actionable.push(graph.nodes[i]);
      }
    }
    if (!actionable.length) return;

    /*
     * Target the cheapest AFFORDABLE technology — the same one the "Ready to
     * research" readout already lists first — so the control always lands on
     * something the player can act on right now.
     *
     * This replaces an earlier pass that framed the bounding box of everything
     * actionable. Once the player has opened several branches that box spans
     * most of the canvas, so its top-left corner is empty gutter: at 1024x768
     * mid-game the map viewport is only 587x597 against a 1920x2576 canvas and
     * the framing landed with ZERO actionable nodes on screen, including after
     * pressing the control whose whole purpose is to fix that.
     */
    actionable.sort(function (a, b) {
      return (b.affordable - a.affordable) || (a.cost - b.cost) || (a.index - b.index);
    });
    var target = actionable[0];

    if (pathMode) {
      var box = document.getElementById('scTech-' + target.id);
      if (box && typeof box.scrollIntoView === 'function') {
        box.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      }
      return;
    }

    var canvas = graph.layout.canvas;
    var left = target.x + target.w / 2 - viewport.clientWidth / 2;
    var top = target.y + target.h / 2 - viewport.clientHeight / 2;

    left = clamp(left, 0, Math.max(0, canvas.width - viewport.clientWidth));
    top = clamp(top, 0, Math.max(0, canvas.height - viewport.clientHeight));
    scrollViewport(viewport, left, top);
  }

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function scrollViewport(viewport, left, top) {
    if (typeof viewport.scrollTo === 'function') {
      try {
        viewport.scrollTo({ left: left, top: top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
        return;
      } catch (e) {
        /* older signature below */
      }
    }
    viewport.scrollLeft = left;
    viewport.scrollTop = top;
  }

  /* ========================================================================= *
   * Responsive mode — one bounded listener, no resize polling
   * ========================================================================= */

  function bindBreakpoint() {
    if (!window.matchMedia) return;
    try {
      mediaQuery = window.matchMedia(PATH_BREAKPOINT);
    } catch (e) {
      return;
    }
    applyBreakpoint(mediaQuery);
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', applyBreakpoint);
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(applyBreakpoint);
    }
  }

  function applyBreakpoint(query) {
    if (!root) return;
    var next = query && query.matches ? 'path' : MODE_GRAPH;
    if (root.getAttribute('data-layout') !== next) root.setAttribute('data-layout', next);
  }

  /* ========================================================================= *
   * Update cadence
   *
   * `refresh(force)` reprojects only when the canonical structure signature
   * moves (an unlock, a purchase, a level) or when forced after a purchase.
   * Otherwise it runs a cheap affordability-only pass — no graph rebuild, no
   * layout, no DOM creation.
   * ========================================================================= */

  /**
   * The component initialises while the research pane is still hidden, so the
   * opening scroll cannot land. Retry once — and only once — as soon as the
   * viewport has real dimensions, i.e. the first time the player opens the tab.
   */
  var focusedOnce = false;

  function focusWhenVisible() {
    if (focusedOnce) return;
    var viewport = document.getElementById('scTechViewport');
    if (!viewport || !viewport.clientWidth) return;
    focusedOnce = true;
    focusFrontier();
  }

  function refresh(force) {
    focusWhenVisible();
    var api = window.SpaceCompanyTechGraph;
    var next = api.structureSignature();
    if (force || next !== signature) {
      signature = next;
      var rebuilt = api.build();
      if (!rebuilt) return;
      /* Geometry is state-independent, so re-projecting cannot move a node. */
      graph = rebuilt;
      for (var i = 0; i < views.length; i++) views[i].node = graph.byId[views[i].node.id];
      renderAll();
      return;
    }
    refreshAffordability();
  }

  /** Science moves every tick; nothing else usually does. */
  function refreshAffordability() {
    var api = window.SpaceCompanyTechGraph;
    var science = api.readScience();
    if (science === graph.science) return;

    graph.science = science;
    var affordable = 0;
    for (var i = 0; i < graph.nodes.length; i++) {
      var node = graph.nodes[i];
      node.science = science;
      node.affordable = science >= node.cost;
      node.missing = Math.max(0, node.cost - science);
      if (isRevealed(node) && node.actionable) {
        node.state = node.affordable ? 'ready' : 'blocked';
        if (node.purchased) node.state = 'progressing';
        if (node.affordable) affordable++;
        renderNode(viewById[node.id]);
      }
    }
    graph.stats.affordable = affordable;
    renderHeader();
    if (selectedId) renderInspector();
  }

  /* ========================================================================= *
   * Registration
   * ========================================================================= */

  var component = {
    initialise: function () {
      if (mode !== MODE_GRAPH || built) return;
      try {
        built = build();
        if (built) {
          renderAll();
          /* Goes through the guarded path: the pane is usually still hidden at
             this point, so the opening scroll lands on the first real tick. */
          focusWhenVisible();
        }
      } catch (error) {
        built = false;
        teardown();
        console.error('Research command center failed to initialise; legacy table retained.', error);
      }
    },

    update: function () {
      if (!built) return;
      try {
        refresh(false);
      } catch (error) {
        console.error('Research command center refresh failed.', error);
      }
    }
  };

  function teardown() {
    if (root && root.parentNode) root.parentNode.removeChild(root);
    root = null;
    graph = null;
    views = [];
    viewById = Object.create(null);
    connectorEls = Object.create(null);
    inspector = null;
    headStats = null;
    selectedId = null;
  }

  if (window.Game && window.Game.uiComponents) {
    window.Game.uiComponents.push(component);
  }

  /* Read-only diagnostics hook, mirroring M1's shell and M2's dashboard. */
  window.SpaceCompanyResearch = {
    mode: mode,
    version: 'm3',
    isGraph: mode === MODE_GRAPH,
    component: component,
    /** Live projection — a snapshot for tests/diagnostics, not game state. */
    getGraph: function () { return graph; },
    getSelection: function () { return selectedId; },
    select: function (id) {
      selectedId = id && graph && graph.byId[id] ? id : null;
      if (built) renderAll();
      return selectedId;
    },
    research: research
  };
})();
