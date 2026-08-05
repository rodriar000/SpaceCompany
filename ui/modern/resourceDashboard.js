/* ============================================================================
 * Space Company — Modern Resource Operations Dashboard (first-party, M2)
 *
 * Replaces the legacy 4-column resource TABLE (`#resourceNavParent`) with a
 * responsive grid of resource cards, as specified in docs/VISUAL_DIRECTION.md.
 *
 * DESIGN: the dashboard is a PROJECTION of the legacy list, not a reimplementation
 * -----------------------------------------------------------------------------
 * Every card is derived from its legacy `<tr id="<res>Nav">` row:
 *   - identity  (id, icon, display name)  <- read from the row's cells
 *   - grouping  (Earth / Inner / Outer)   <- read from the `collapse*` header rows
 *   - lock state                          <- mirrors the row's `.hidden` class
 *   - selection state                     <- mirrors the row's `info` class
 *   - activation                          <- dispatches a real click ON THE ROW,
 *                                            so `activeResourceTab()` + the
 *                                            Bootstrap tab data-api run unchanged
 * There is no second source of truth: if the legacy list changes, the dashboard
 * follows automatically. That is what makes parity structural rather than
 * hand-maintained.
 *
 * Live values come from the game's own read-only accessors
 * (`getResource` / `getStorage` / `getProduction`) and are formatted with the
 * game's own delegates (`Game.resourcesUI.create*Delegate`), so a card and its
 * legacy row can never disagree about a number.
 *
 * HARD CONSTRAINTS (same contract as M1 — see docs/UI_DOM_CONTRACT.md):
 *   - READ-ONLY view. Never writes a resource, production, storage or any other
 *     gameplay global; never mutates the save; never calls Game.save/load.
 *   - Never reads or writes localStorage["save"]. The only storage it touches is
 *     its own presentation preference key (`sc.ui.resourceDensity`).
 *   - Never overrides / removes / adds the legacy `.hidden` class, and never
 *     changes the legacy DOM contract. The legacy rows stay in the document,
 *     data-bound and fully functional; modern CSS merely hides the column while
 *     this dashboard is present.
 *   - Degrades safely: if anything throws, the legacy resource list stays
 *     visible (the CSS that hides it requires this dashboard to exist).
 * ==========================================================================*/
(function () {
  'use strict';

  var MODE_CARDS = 'cards';
  var MODE_LEGACY = 'legacy';

  var ROOT_ID = 'scResourceDashboard';
  var DENSITY_KEY = 'sc.ui.resourceDensity';
  var DENSITY_COMFORTABLE = 'comfortable';
  var DENSITY_COMPACT = 'compact';

  /* -- state ---------------------------------------------------------------- */
  var mode = resolveMode();
  var cards = [];        // [{ id, navId, row, el, ... , cache }]
  var groups = [];       // [{ el, cards: [] }]
  var root = null;
  var built = false;

  /* ========================================================================= *
   * Mode & preferences (presentation only — never the save)
   * ========================================================================= */

  /** Cards by default; `?ui=legacy` or `?resources=legacy` restores the table. */
  function resolveMode() {
    var search = (window.location && window.location.search) || '';
    return /[?&](?:ui|resources)=legacy(?:&|$)/i.test(search) ? MODE_LEGACY : MODE_CARDS;
  }

  /**
   * Density is a pure display preference stored under its OWN key. It is not
   * part of, and never touches, the game's save (see docs/SAVE_COMPATIBILITY.md).
   */
  function readDensity() {
    try {
      var stored = window.localStorage.getItem(DENSITY_KEY);
      return stored === DENSITY_COMPACT ? DENSITY_COMPACT : DENSITY_COMFORTABLE;
    } catch (e) {
      return DENSITY_COMFORTABLE;
    }
  }

  function writeDensity(value) {
    try {
      window.localStorage.setItem(DENSITY_KEY, value);
    } catch (e) {
      /* private mode / storage disabled — the toggle still works for this session */
    }
  }

  /* ========================================================================= *
   * Read-only game accessors (with safe fallbacks so the view can never throw)
   * ========================================================================= */

  function readCurrent(id) {
    return typeof window.getResource === 'function' ? Number(window.getResource(id)) || 0 : 0;
  }

  function readCapacity(id) {
    if (typeof window.getStorage !== 'function') return -1;
    var value = Number(window.getStorage(id));
    return isNaN(value) ? -1 : value;
  }

  function readPerSecond(id) {
    if (typeof window.getProduction !== 'function') return 0;
    var value = Number(window.getProduction(id));
    return isNaN(value) ? 0 : value;
  }

  function formatNumber(value) {
    var settings = window.Game && window.Game.settings;
    if (settings && typeof settings.format === 'function') return String(settings.format(value));
    return String(value);
  }

  /**
   * Borrow the legacy formatting delegates so a card renders a number with the
   * exact same rules as the legacy row (Science/RocketFuel decimals, the Energy
   * per-second banding, …). Falls back to the generic formatter.
   */
  function makeDelegate(factoryName, id, fallback) {
    var ui = window.Game && window.Game.resourcesUI;
    if (ui && typeof ui[factoryName] === 'function') {
      try {
        var delegate = ui[factoryName](id);
        if (typeof delegate === 'function') {
          return function () {
            try {
              return String(delegate());
            } catch (e) {
              return fallback();
            }
          };
        }
      } catch (e) {
        /* fall through to the generic formatter */
      }
    }
    return fallback;
  }

  /**
   * "full in 01:23:45" / "empty in 93d 16h" — the card's ETA, on the game's own
   * clock.
   *
   * Under a day we defer to `getFullTimeDisplay` so a card reads exactly like
   * the detail panel's "time remaining" line. Past a day we compact from the
   * same `splitDateTime` decomposition, for two reasons:
   *   1. `93 Days 16:53:07` overflows the card's secondary line at late-game
   *      magnitudes, and a truncated ETA is worse than a coarse one;
   *   2. `getFullTimeDisplay` prints only `splitDateTime()[1]`, so it silently
   *      drops the years component — "2 years 30 days" renders as "30 Days".
   *      Reading the decomposition ourselves keeps long ETAs truthful.
   */
  function formatDuration(seconds) {
    var utils = window.Game && window.Game.utils;
    if (!utils || typeof utils.splitDateTime !== 'function') {
      return Math.round(seconds) + 's';
    }

    var parts = utils.splitDateTime(seconds); // [y, d, h, m, s, ms]
    var years = parts[0];
    var days = parts[1];
    var hours = parts[2];

    if (years > 0) return years + 'y ' + days + 'd';
    if (days > 0) return days + 'd ' + hours + 'h';

    if (typeof utils.getFullTimeDisplay === 'function') {
      return String(utils.getFullTimeDisplay(seconds));
    }
    return hours + 'h ' + parts[3] + 'm';
  }

  /* ========================================================================= *
   * Projection of the legacy list
   * ========================================================================= */

  /** Text of a row cell, collapsed to a single line. */
  function cellText(cell) {
    return (cell && (cell.textContent || '')).replace(/\s+/g, ' ').trim();
  }

  /**
   * Walk `#resourceNavParent` in document order and describe it:
   * `collapse*` rows open a group; `<res>Nav` rows become cards in the open group.
   * Nothing is hardcoded — the legacy table is the schema.
   */
  function readLegacyList() {
    var table = document.getElementById('resourceNavParent');
    if (!table) return [];

    var current = { title: '', key: 'primary', rows: [] };
    var result = [current];
    var rows = table.getElementsByTagName('tr');

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var id = row.id || '';

      if (/^collapse/.test(id)) {
        current = {
          title: cellText(row.getElementsByTagName('td')[0]).replace(/\s*$/, ''),
          key: id.replace(/^collapse/, '').toLowerCase(),
          rows: []
        };
        result.push(current);
        continue;
      }

      if (!/Nav$/.test(id)) continue;

      var cells = row.getElementsByTagName('td');
      if (cells.length < 4) continue;

      var icon = row.getElementsByTagName('img')[0];
      current.rows.push({
        navId: id,
        resourceId: id.replace(/Nav$/, ''),
        name: cellText(cells[1]),
        iconSrc: icon ? icon.getAttribute('src') : '',
        row: row
      });
    }

    return result.filter(function (group) { return group.rows.length > 0; });
  }

  /** The legacy `.hidden` class is the single source of truth for "locked". */
  function isLocked(row) {
    return (' ' + (row.className || '') + ' ').indexOf(' hidden ') !== -1;
  }

  /** `activeResourceTab()` appends `info` to the selected row. */
  function isSelected(row) {
    return (' ' + (row.className || '') + ' ').indexOf(' info ') !== -1;
  }

  /* ========================================================================= *
   * DOM construction
   * ========================================================================= */

  function el(tag, className, parent) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (parent) parent.appendChild(node);
    return node;
  }

  function buildToolbar(container) {
    var bar = el('div', 'sc-res-toolbar', container);

    var title = el('h2', 'sc-res-toolbar__title', bar);
    title.appendChild(document.createTextNode('Resource Operations'));

    var count = el('span', 'sc-res-toolbar__count', bar);
    count.id = 'scResourceCount';

    var toggle = el('button', 'sc-res-density', bar);
    toggle.type = 'button';
    toggle.id = 'scResourceDensity';
    toggle.setAttribute('aria-label', 'Toggle resource card density');
    toggle.appendChild(document.createTextNode('Compact'));
    toggle.onclick = function () {
      var next = root.getAttribute('data-density') === DENSITY_COMPACT
        ? DENSITY_COMFORTABLE
        : DENSITY_COMPACT;
      applyDensity(next);
      writeDensity(next);
    };

    return { count: count, toggle: toggle };
  }

  function applyDensity(density) {
    root.setAttribute('data-density', density);
    var toggle = document.getElementById('scResourceDensity');
    if (toggle) {
      var compact = density === DENSITY_COMPACT;
      toggle.firstChild.nodeValue = compact ? 'Comfortable' : 'Compact';
      toggle.setAttribute('aria-pressed', compact ? 'true' : 'false');
    }
  }

  /**
   * One card. Built once; only text nodes / attributes are touched afterwards,
   * so the 10 Hz update loop never re-creates DOM.
   */
  function buildCard(spec, grid) {
    var button = el('button', 'sc-res-card', grid);
    button.type = 'button';
    button.id = 'scResCard_' + spec.resourceId;
    button.setAttribute('data-resource', spec.resourceId);
    button.setAttribute('data-nav', spec.navId);
    button.setAttribute('aria-pressed', 'false');

    var data = window.Game && window.Game.resourceData && window.Game.resourceData[spec.resourceId];
    if (data && data.desc) button.setAttribute('title', data.desc);

    var head = el('span', 'sc-res-card__head', button);
    if (spec.iconSrc) {
      var icon = el('img', 'sc-res-card__icon', head);
      icon.setAttribute('src', spec.iconSrc);
      icon.setAttribute('alt', '');
      icon.setAttribute('aria-hidden', 'true');
    }
    var name = el('span', 'sc-res-card__name', head);
    name.appendChild(document.createTextNode(spec.name));

    /* State badge: glyph + word, so status never depends on colour alone. */
    var state = el('span', 'sc-res-card__state', head);
    var stateGlyph = el('span', 'sc-res-card__state-glyph', state);
    stateGlyph.setAttribute('aria-hidden', 'true');
    stateGlyph.appendChild(document.createTextNode(''));
    var stateLabel = el('span', 'sc-res-card__state-label', state);
    stateLabel.appendChild(document.createTextNode(''));

    var value = el('span', 'sc-res-card__value', button);
    var current = el('span', 'sc-res-card__current', value);
    current.appendChild(document.createTextNode('0'));
    var capacityWrap = el('span', 'sc-res-card__capacity-wrap', value);
    capacityWrap.appendChild(document.createTextNode(' / '));
    var capacity = el('span', 'sc-res-card__capacity', capacityWrap);
    capacity.appendChild(document.createTextNode('0'));

    var meter = el('span', 'sc-res-card__meter', button);
    meter.setAttribute('role', 'progressbar');
    meter.setAttribute('aria-valuemin', '0');
    meter.setAttribute('aria-valuemax', '100');
    meter.setAttribute('aria-valuenow', '0');
    meter.setAttribute('aria-label', spec.name + ' storage');
    var fill = el('span', 'sc-res-card__fill', meter);

    var foot = el('span', 'sc-res-card__foot', button);
    var rate = el('span', 'sc-res-card__rate', foot);
    var rateGlyph = el('span', 'sc-res-card__rate-glyph', rate);
    rateGlyph.setAttribute('aria-hidden', 'true');
    rateGlyph.appendChild(document.createTextNode(''));
    var rateValue = el('span', 'sc-res-card__rate-value', rate);
    rateValue.appendChild(document.createTextNode('0'));
    var rateUnit = el('span', 'sc-res-card__rate-unit', rate);
    rateUnit.appendChild(document.createTextNode('/s'));
    var eta = el('span', 'sc-res-card__eta', foot);
    eta.appendChild(document.createTextNode(''));

    return {
      resourceId: spec.resourceId,
      navId: spec.navId,
      row: spec.row,
      el: button,
      nodes: {
        current: current.firstChild,
        capacity: capacity.firstChild,
        capacityWrap: capacityWrap,
        meter: meter,
        fill: fill,
        rateValue: rateValue.firstChild,
        rateGlyph: rateGlyph.firstChild,
        rate: rate,
        eta: eta.firstChild,
        stateGlyph: stateGlyph.firstChild,
        stateLabel: stateLabel.firstChild
      },
      format: {
        current: makeDelegate('createResourceDelegate', spec.resourceId, function () {
          return formatNumber(readCurrent(spec.resourceId));
        }),
        capacity: makeDelegate('createStorageDelegate', spec.resourceId, function () {
          return formatNumber(readCapacity(spec.resourceId));
        }),
        perSecond: makeDelegate('createProductionDelegate', spec.resourceId, function () {
          return formatNumber(readPerSecond(spec.resourceId));
        })
      },
      cache: {}
    };
  }

  function build() {
    var pane = document.getElementById('resources');
    if (!pane || document.getElementById(ROOT_ID)) return false;

    var model = readLegacyList();
    if (model.length === 0) return false;

    root = el('div', 'sc-res-dash');
    root.id = ROOT_ID;

    buildToolbar(root);

    var hint = el('p', 'sc-res-hint', root);
    hint.id = 'scResourceHint';
    hint.appendChild(document.createTextNode(
      'Select a resource to open its operations panel.'
    ));

    for (var g = 0; g < model.length; g++) {
      var group = model[g];
      var section = el('section', 'sc-res-group', root);
      section.setAttribute('data-group', group.key);

      if (group.title) {
        var heading = el('h3', 'sc-res-group__title', section);
        heading.appendChild(document.createTextNode(group.title));
      }

      var grid = el('div', 'sc-res-grid', section);
      var groupCards = [];
      for (var r = 0; r < group.rows.length; r++) {
        var card = buildCard(group.rows[r], grid);
        cards.push(card);
        groupCards.push(card);
      }
      groups.push({ el: section, cards: groupCards });
    }

    /* One delegated listener: a card click IS a click on its legacy row. */
    root.addEventListener('click', onDashboardClick, false);

    pane.insertBefore(root, pane.firstChild);
    applyDensity(readDensity());
    return true;
  }

  /* ========================================================================= *
   * Interaction — delegated to the legacy row, never reimplemented
   * ========================================================================= */

  function onDashboardClick(event) {
    /* Walk up from the clicked node to the card that carries the row pointer,
       so clicks on the icon, meter or any inner label still activate the card. */
    var node = event.target;
    while (node && node !== root && !(node.getAttribute && node.getAttribute('data-nav'))) {
      node = node.parentNode;
    }
    if (!node || node === root || !node.getAttribute) return;

    var navId = node.getAttribute('data-nav');
    var row = navId && document.getElementById(navId);
    if (!row) return;

    /* Dispatch a genuine click on the legacy row so BOTH the inline
       `activeResourceTab(...)` handler and Bootstrap's `data-toggle="tab"`
       data-api run exactly as they do for a legacy click. */
    if (typeof row.click === 'function') {
      row.click();
    } else if (window.jQuery) {
      window.jQuery(row).trigger('click');
    }

    sync();
  }

  /* ========================================================================= *
   * Per-tick synchronisation (read-only, diffed before touching the DOM)
   * ========================================================================= */

  function setText(node, text) {
    if (node && node.nodeValue !== text) node.nodeValue = text;
  }

  function setAttr(node, name, value) {
    if (node && node.getAttribute(name) !== value) node.setAttribute(name, value);
  }

  function setClass(node, className) {
    if (node && node.className !== className) node.className = className;
  }

  /** Classify a resource for the state badge (glyph + word + colour). */
  function classify(current, capacity, perSecond) {
    var capped = capacity >= 0;
    if (capped && capacity > 0 && current >= capacity) return 'full';
    if (perSecond < 0) return 'draining';
    if (perSecond > 0) return 'producing';
    return 'idle';
  }

  var STATE_GLYPH = { full: '◆', draining: '▼', producing: '▲', idle: '▬' };
  var STATE_LABEL = { full: 'Full', draining: 'Draining', producing: 'Producing', idle: 'Idle' };

  function syncCard(card) {
    var cache = card.cache;
    var current = readCurrent(card.resourceId);
    var capacity = readCapacity(card.resourceId);
    var perSecond = readPerSecond(card.resourceId);
    var capped = capacity >= 0;

    var currentText = card.format.current();
    setText(card.nodes.current, currentText);

    if (capped) {
      setText(card.nodes.capacity, card.format.capacity());
      setClass(card.nodes.capacityWrap, 'sc-res-card__capacity-wrap');
    } else {
      setText(card.nodes.capacity, '∞');
      setClass(card.nodes.capacityWrap, 'sc-res-card__capacity-wrap is-uncapped');
    }

    /* Storage meter (hidden entirely for uncapped resources). */
    var percent = capped && capacity > 0
      ? Math.max(0, Math.min(100, (current / capacity) * 100))
      : -1;
    if (percent < 0) {
      setClass(card.nodes.meter, 'sc-res-card__meter is-hidden');
    } else {
      setClass(card.nodes.meter, 'sc-res-card__meter');
      var rounded = Math.round(percent * 10) / 10;
      if (cache.percent !== rounded) {
        card.nodes.fill.style.width = rounded + '%';
        setAttr(card.nodes.meter, 'aria-valuenow', String(Math.round(rounded)));
        cache.percent = rounded;
      }
    }

    /* Rate: the sign is carried by our own glyph and a class, never by colour
       alone. The formatted value keeps the legacy digits but sheds its leading
       minus so a deficit reads "−2,940/s", not "−−2,940/s". */
    var sign = perSecond > 0 ? 'positive' : (perSecond < 0 ? 'negative' : 'idle');
    setText(card.nodes.rateValue, card.format.perSecond().replace(/^\s*[-−]\s*/, ''));
    setText(card.nodes.rateGlyph, perSecond > 0 ? '+' : (perSecond < 0 ? '−' : '·'));
    setClass(card.nodes.rate, 'sc-res-card__rate is-' + sign);

    /* Time-to-full / time-to-empty. Durations under a second are dropped: the
       legacy clock renders them "00:00:00", which reads as broken rather than
       as "imminent", and an ETA that short tells the player nothing. */
    var eta = '';
    if (perSecond > 0 && capped && capacity > current) {
      var toFull = (capacity - current) / perSecond;
      if (toFull >= 1) eta = 'full in ' + formatDuration(toFull);
    } else if (perSecond < 0 && current > 0) {
      var toEmpty = current / Math.abs(perSecond);
      if (toEmpty >= 1) eta = 'empty in ' + formatDuration(toEmpty);
    }
    setText(card.nodes.eta, eta);

    /* State badge. */
    var state = classify(current, capacity, perSecond);
    if (cache.state !== state) {
      setText(card.nodes.stateGlyph, STATE_GLYPH[state]);
      setText(card.nodes.stateLabel, STATE_LABEL[state]);
      cache.state = state;
    }

    /* Lock + selection mirror the legacy row. */
    var locked = isLocked(card.row);
    var selected = isSelected(card.row);
    setClass(card.el, 'sc-res-card' +
      (locked ? ' sc-is-locked' : '') +
      (selected ? ' sc-is-selected' : '') +
      ' sc-state-' + state);
    setAttr(card.el, 'aria-pressed', selected ? 'true' : 'false');

    return { locked: locked, selected: selected };
  }

  function sync() {
    if (!built) return;

    var unlocked = 0;
    var anySelected = false;

    for (var i = 0; i < cards.length; i++) {
      var result = syncCard(cards[i]);
      if (!result.locked) unlocked++;
      if (result.selected) anySelected = true;
    }

    /* A group with nothing unlocked collapses away (our own class — the legacy
       `.hidden` contract is never touched). */
    for (var g = 0; g < groups.length; g++) {
      var group = groups[g];
      var visible = false;
      for (var c = 0; c < group.cards.length; c++) {
        if (!isLocked(group.cards[c].row)) { visible = true; break; }
      }
      setClass(group.el, 'sc-res-group' + (visible ? '' : ' sc-is-empty'));
    }

    var count = document.getElementById('scResourceCount');
    if (count) {
      var text = unlocked + (unlocked === 1 ? ' resource online' : ' resources online');
      if (count.firstChild) setText(count.firstChild, text);
      else count.appendChild(document.createTextNode(text));
    }

    setClass(root, 'sc-res-dash' + (anySelected ? ' sc-has-selection' : ''));
  }

  /* ========================================================================= *
   * Registration with the game's UI component loop
   * ========================================================================= */

  var component = {
    initialise: function () {
      if (mode !== MODE_CARDS || built) return;
      try {
        built = build();
        if (built) sync();
      } catch (error) {
        /* Never take the resource list down with us: without this dashboard in
           the DOM the modern CSS leaves the legacy table visible. */
        built = false;
        if (root && root.parentNode) root.parentNode.removeChild(root);
        root = null;
        cards = [];
        groups = [];
        console.error('Resource dashboard failed to initialise; legacy list retained.', error);
      }
    },

    update: function () {
      if (!built) return;
      try {
        sync();
      } catch (error) {
        console.error('Resource dashboard sync failed.', error);
      }
    }
  };

  if (window.Game && window.Game.uiComponents) {
    window.Game.uiComponents.push(component);
  }

  /* Diagnostics hook (read-only), mirroring window.SpaceCompanyShell from M1. */
  window.SpaceCompanyResources = {
    mode: mode,
    version: 'm2',
    isCards: mode === MODE_CARDS,
    /** Test/diagnostic access — returns the live component, not game state. */
    component: component
  };
})();
