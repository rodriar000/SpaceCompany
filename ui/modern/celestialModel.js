/* ============================================================================
 * Space Company — Canonical Celestial Projection (first-party, M4)
 *
 * A READ-ONLY model of the inherited solar-system and interstellar progression.
 * Like M3's technology graph it is a *lens*, never an engine.
 *
 * WHERE TRUTH LIVES (never here):
 *   - `<tr id="<bodyId>">`                lock state (`.hidden`) + selection (`info`)
 *   - `explored[]`                        which places have been explored
 *   - `<tr id="explore<Body>">`           whether the exploration offer is still open
 *   - `#<bodyId>RocketFuelCost`           the published fuel cost (static, canonical)
 *   - `getResource(RESOURCE.RocketFuel)`  the resource `explore()` actually checks
 *   - `explore('<Body>')`                 the one and only exploration action
 *   - `rocket`, `rocketLaunched`          launch-vehicle state
 *   - `Game.interstellar.stars.entries`   per-star `explored` / `owned` / `distance`
 *   - `Game.interstellar.comms.entries`   telescope range that DISCOVERS stars
 *   - `Game.interstellar.rocket.entries`  whether the interstellar rocket is built
 *   - `Game.interstellar.stars.exploreSystem(id)`  the one and only star action
 *
 * WHAT THIS FILE MUST NEVER DO:
 *   - write any gameplay value, flag, resource or save field
 *   - reimplement a cost, a distance formula or an unlock condition
 *   - reveal a destination the canonical game still conceals
 *
 * See docs/M4_CELESTIAL_OPERATIONS.md for the full boundary.
 * ==========================================================================*/
(function () {
  'use strict';

  /* ========================================================================= *
   * 1. Presentation registry — DOM ANCHORS AND VISUAL PLACEMENT ONLY
   *
   * Every row here records WHERE a destination lives in the legacy DOM and
   * WHERE it should be drawn. It deliberately contains no cost, no requirement
   * and no unlock rule: those are read at runtime from the canonical sources
   * listed above. `test/celestialModel.test.mjs` re-reads `solarSystem.js` and
   * fails if the routes below stop matching what the game actually does.
   * ========================================================================= */

  var SOLAR = [
    /* id            label              type      ring parent        explore action */
    ['spaceRocket', 'Launch Vehicle', 'staging', 0, null, null],
    ['moon', 'The Moon', 'moon', 1, 'spaceRocket', 'Moon'],
    ['mercury', 'Mercury', 'planet', 1, 'spaceRocket', null],
    ['venus', 'Venus', 'planet', 1, 'spaceRocket', 'Venus'],
    ['mars', 'Mars', 'planet', 1, 'spaceRocket', 'Mars'],
    ['asteroidBelt', 'Asteroid Belt', 'belt', 1, 'spaceRocket', 'AsteroidBelt'],
    ['wonderStation', 'Wonder Station', 'station', 2, 'asteroidBelt', 'WonderStation'],
    ['jupiter', 'Jupiter', 'planet', 2, 'asteroidBelt', 'Jupiter'],
    ['saturn', 'Saturn', 'planet', 2, 'asteroidBelt', 'Saturn'],
    ['uranus', 'Uranus', 'planet', 2, 'asteroidBelt', null],
    ['neptune', 'Neptune', 'planet', 2, 'asteroidBelt', null],
    ['pluto', 'Pluto', 'planet', 2, 'asteroidBelt', 'Pluto'],
    ['kuiperBelt', 'Kuiper Belt', 'belt', 2, 'asteroidBelt', 'KuiperBelt'],
    ['solCenter', 'Sol Center', 'special', 3, 'kuiperBelt', 'SolCenter']
  ];

  /**
   * Mercury, Uranus and Neptune are navigable and described, but the canonical
   * `explore()` has no data for them — the game states outright that they are
   * "not worth exploring". They are survey-only stops, not a modelling gap.
   */
  var SURVEY_ONLY = { mercury: true, uranus: true, neptune: true };

  var RING_LABEL = {
    0: 'Launch operations',
    1: 'Inner system',
    2: 'Outer system',
    3: 'Solar core'
  };

  /* ========================================================================= *
   * 2. Safe canonical readers — every one is READ-ONLY
   * ========================================================================= */

  function byId(id) {
    return typeof document !== 'undefined' ? document.getElementById(id) : null;
  }

  function classList(el) {
    return el && el.className ? (' ' + el.className + ' ') : ' ';
  }

  /** The legacy row is hidden while a destination is not yet reachable. */
  function rowLocked(row) {
    return !row || classList(row).indexOf(' hidden ') !== -1;
  }

  /** `activeSolarTab` appends `info` to the row it selects. */
  function rowSelected(row) {
    return classList(row).indexOf(' info ') !== -1;
  }

  function exploredList() {
    var list = window.explored;
    return Object.prototype.toString.call(list) === '[object Array]' ? list : [];
  }

  function rocketFuel() {
    if (typeof window.getResource === 'function' && window.RESOURCE) {
      var value = Number(window.getResource(window.RESOURCE.RocketFuel));
      if (!isNaN(value)) return value;
    }
    var fallback = Number(window.rocketFuel);
    return isNaN(fallback) ? 0 : fallback;
  }

  function antimatter() {
    var value = Number(window.antimatter);
    return isNaN(value) ? 0 : value;
  }

  /**
   * The published fuel cost, read from the legacy pane rather than copied.
   * These spans are static plain integers written by no script; if that ever
   * stops being true the parse fails and the model reports an unknown cost
   * instead of inventing one.
   */
  function publishedFuelCost(id) {
    var span = byId(id + 'RocketFuelCost');
    if (!span) return null;
    var text = String(span.textContent || '').replace(/[\s,]/g, '');
    return /^\d+$/.test(text) ? Number(text) : null;
  }

  function formatNumber(value) {
    var settings = window.Game && window.Game.settings;
    if (settings && typeof settings.format === 'function') {
      try {
        return String(settings.format(value));
      } catch (e) { /* fall through */ }
    }
    return String(value);
  }

  /* ========================================================================= *
   * 3. Solar destinations
   * ========================================================================= */

  function buildSolar(diagnostics) {
    var nodes = [];
    var byKey = Object.create(null);
    var done = exploredList();
    var fuel = rocketFuel();
    var launched = window.rocketLaunched === true;

    for (var i = 0; i < SOLAR.length; i++) {
      var spec = SOLAR[i];
      var id = spec[0];
      var row = byId(id);

      if (!row) {
        diagnostics.missingAnchors.push(id);
        continue;
      }

      var action = spec[5];
      var exploreRow = action ? byId('explore' + action) : null;
      if (action && !exploreRow) diagnostics.missingAnchors.push('explore' + action);

      var locked = rowLocked(row);
      var explored = done.indexOf(id) !== -1;
      /* The offer closes the moment `explore()` hides its row, which is the
         same instant it pushes onto `explored`; reading both keeps the state
         correct for saves restored mid-progress. */
      var offerOpen = !!exploreRow && !rowLocked(exploreRow);
      var cost = action ? publishedFuelCost(id) : null;

      var node = {
        id: id,
        kind: 'solar',
        label: spec[1],
        type: spec[2],
        ring: spec[3],
        ringLabel: RING_LABEL[spec[3]] || '',
        parent: spec[4],
        children: [],
        actionTarget: action,
        surveyOnly: !!SURVEY_ONLY[id],

        rowId: id,
        exploreRowId: action ? 'explore' + action : null,

        locked: locked,
        explored: explored,
        selected: rowSelected(row),
        offerOpen: offerOpen,

        cost: cost,
        costText: cost === null ? null : formatNumber(cost),
        costResource: 'Rocket Fuel',
        held: fuel,
        affordable: cost === null ? null : fuel >= cost,
        missing: cost === null ? null : Math.max(0, cost - fuel),

        launched: launched,
        visibility: 'undiscovered',
        state: 'undiscovered',
        actionable: false
      };
      nodes.push(node);
      byKey[id] = node;
    }

    /* Parent/child wiring, validated rather than assumed. */
    for (i = 0; i < nodes.length; i++) {
      var parent = nodes[i].parent;
      if (parent === null) continue;
      if (!byKey[parent]) { diagnostics.invalidParents.push(nodes[i].id + '->' + parent); continue; }
      byKey[parent].children.push(nodes[i].id);
    }

    for (i = 0; i < nodes.length; i++) finaliseSolar(nodes[i]);
    return { nodes: nodes, byKey: byKey };
  }

  /**
   * Visibility follows the canonical row: a hidden row is a destination the
   * player has not reached, so the modern view conceals its name too.
   * The single documented exception is a DIRECT successor of somewhere already
   * reachable, which is shown as an unnamed "next" marker so the map has a
   * sense of direction — never with a name, cost or description.
   */
  function finaliseSolar(node) {
    if (node.id === 'spaceRocket') {
      /* `launchRocket()` HIDES this row once the vehicle is spent, so a hidden
         row here means "already launched", not "never discovered". Reading the
         canonical `rocketLaunched` flag keeps the two apart. */
      node.visibility = (node.launched || !node.locked) ? 'visible' : 'undiscovered';
      node.state = node.launched ? 'explored' : (node.locked ? 'undiscovered' : 'ready');
      node.actionable = false;               // building/launching lives in the legacy pane
      applyPublic(node);
      return;
    }

    if (node.locked) {
      node.visibility = 'undiscovered';
      node.state = 'undiscovered';
      node.actionable = false;
      applyPublic(node);
      return;
    }

    node.visibility = 'visible';

    if (node.surveyOnly) {
      node.state = 'survey';
      node.actionable = false;
    } else if (node.explored || !node.offerOpen) {
      node.state = 'explored';
      node.actionable = false;
    } else if (node.affordable === false) {
      node.state = 'blocked';
      node.actionable = true;
    } else {
      node.state = 'ready';
      node.actionable = true;
    }
    applyPublic(node);
  }

  /* ========================================================================= *
   * 4. Interstellar destinations
   *
   * Discovery is the canonical telescope range:
   *   IRS.count + astroBreakthrough.count * 5 >= distance
   * which is the exact condition `ui/interstellarUI.js` uses to un-hide a star
   * row. The model READS that condition's inputs; it never re-decides it — the
   * authoritative answer is always the row's own hidden state, with the range
   * used only to explain WHY a star is still dark.
   * ========================================================================= */

  function commsRange() {
    var comms = window.Game && window.Game.interstellar && window.Game.interstellar.comms;
    var entries = comms && comms.entries;
    if (!entries || !entries.IRS || !entries.astroBreakthrough) return null;
    var irs = Number(entries.IRS.count) || 0;
    var astro = Number(entries.astroBreakthrough.count) || 0;
    return { irs: irs, astro: astro, reach: irs + astro * 5 };
  }

  function interstellarRocketBuilt() {
    var rocket = window.Game && window.Game.interstellar && window.Game.interstellar.rocket;
    var entry = rocket && rocket.entries && rocket.entries.tier1Rocket;
    return !!(entry && entry.built === true);
  }

  function buildStars(diagnostics) {
    var stars = window.Game && window.Game.interstellar && window.Game.interstellar.stars;
    var entries = stars && stars.entries;
    if (!entries) return { nodes: [], byKey: Object.create(null), range: null, rocketBuilt: false };

    var range = commsRange();
    var built = interstellarRocketBuilt();
    var held = antimatter();
    var nodes = [];
    var byKey = Object.create(null);

    var ids = Object.keys(entries);
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var data = entries[id];
      var row = byId('star_' + id);
      if (!row) { diagnostics.missingAnchors.push('star_' + id); continue; }

      var explored = data.explored === true;
      var owned = data.owned === true;
      /* The row itself is the authority on discovery. */
      var discovered = explored || owned || !rowLocked(row);

      var node = {
        id: id,
        kind: 'star',
        /* Raw canonical values live on the node so the inspector can use them
           once the star is discovered; the view may only ever render the
           `public*` fields, which conceal them until then. */
        name: data.name,
        label: discovered ? data.name : 'Uncharted',
        type: 'star',
        distance: Number(data.distance) || 0,
        planets: Number(data.planets) || 0,
        faction: data.faction,
        factionId: data.factionId,
        ring: 4,
        ringLabel: 'Interstellar',
        parent: null,
        children: [],

        rowId: 'star_' + id,
        actionId: 'star_' + id + '_explore',
        conquerRowId: 'star_' + id + '_conquer',

        discovered: discovered,
        explored: explored,
        owned: owned,
        rocketBuilt: built,
        held: held,
        heldText: formatNumber(held),

        /* Cost text is read from the legacy span, which interstellarUI keeps
           current. The model deliberately does NOT recompute the antimatter
           price: doing so would duplicate `star.js`'s cost formula, which the
           M4 contract forbids. See the documented limitation. */
        costText: costTextFor(id),

        visibility: discovered ? 'visible' : 'undiscovered',
        state: 'undiscovered',
        actionable: false
      };

      if (!discovered) {
        node.state = 'undiscovered';
      } else if (owned) {
        node.state = 'completed';
      } else if (explored) {
        node.state = 'explored';
      } else if (!built) {
        node.state = 'blocked';
      } else {
        node.state = 'ready';
        node.actionable = true;
      }

      applyPublic(node);
      nodes.push(node);
      byKey[id] = node;
    }

    /* Deterministic order: nearest first, then by id so ties never wobble. */
    nodes.sort(function (a, b) {
      return (a.distance - b.distance) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });

    return { nodes: nodes, byKey: byKey, range: range, rocketBuilt: built };
  }

  function costTextFor(id) {
    var span = byId('star_' + id + 'Cost');
    var text = span ? String(span.textContent || '').trim() : '';
    return text || null;
  }

  /* ========================================================================= *
   * 5. Concealment
   *
   * Enforced HERE so the view cannot leak by accident: a concealed destination
   * exposes only `publicLabel`, and every other public field is emptied.
   * ========================================================================= */

  function applyPublic(node) {
    if (node.visibility === 'visible') {
      node.publicLabel = node.label;
      node.publicCostText = node.costText || null;
      node.publicDistance = node.kind === 'star' ? node.distance : null;
      node.publicFaction = node.kind === 'star' ? node.faction : null;
      return;
    }
    node.publicLabel = node.kind === 'star' ? 'Uncharted system' : 'Unsurveyed';
    node.publicCostText = null;
    node.publicDistance = null;
    node.publicFaction = null;
  }

  /* ========================================================================= *
   * 6. Assembly, validation and the frontier
   * ========================================================================= */

  function build() {
    var diagnostics = {
      missingAnchors: [],
      invalidParents: [],
      duplicateIds: [],
      orphans: [],
      duplicateRoutes: [],
      actionless: []
    };

    var solar = buildSolar(diagnostics);
    var stars = buildStars(diagnostics);

    var all = solar.nodes.concat(stars.nodes);
    var seen = Object.create(null);
    var routes = [];
    var routeSeen = Object.create(null);
    var i;

    for (i = 0; i < all.length; i++) {
      var key = all[i].kind + ':' + all[i].id;
      if (seen[key]) diagnostics.duplicateIds.push(key);
      seen[key] = true;
      all[i].domId = 'scCel-' + all[i].kind + '-' + all[i].id;
    }

    for (i = 0; i < solar.nodes.length; i++) {
      var node = solar.nodes[i];
      if (node.parent) {
        var route = node.parent + '->' + node.id;
        if (routeSeen[route]) diagnostics.duplicateRoutes.push(route);
        routeSeen[route] = true;
        routes.push({ from: node.parent, to: node.id });
      } else if (node.id !== 'spaceRocket') {
        diagnostics.orphans.push(node.id);
      }
      if (!node.surveyOnly && !node.actionTarget && node.id !== 'spaceRocket') {
        diagnostics.actionless.push(node.id);
      }
    }

    var stats = summarise(solar.nodes, stars.nodes, stars);

    return {
      version: 'm4',
      solar: solar.nodes,
      solarByKey: solar.byKey,
      stars: stars.nodes,
      starsByKey: stars.byKey,
      all: all,
      routes: routes,
      rings: [0, 1, 2, 3],
      ringLabel: RING_LABEL,
      range: stars.range,
      interstellarRocketBuilt: stars.rocketBuilt,
      diagnostics: diagnostics,
      stats: stats,
      frontier: pickFrontier(solar.nodes, stars.nodes)
    };
  }

  function summarise(solarNodes, starNodes, stars) {
    var s = {
      solarTotal: solarNodes.length,
      solarVisible: 0,
      solarExplored: 0,
      solarReady: 0,
      starsTotal: starNodes.length,
      starsDiscovered: 0,
      starsExplored: 0,
      starsOwned: 0,
      region: 'Earth operations'
    };
    var i;
    for (i = 0; i < solarNodes.length; i++) {
      var n = solarNodes[i];
      if (n.visibility === 'visible') s.solarVisible++;
      if (n.state === 'explored' && n.id !== 'spaceRocket') s.solarExplored++;
      if (n.state === 'ready') s.solarReady++;
      if (n.selected && n.visibility === 'visible') s.region = n.publicLabel;
    }
    for (i = 0; i < starNodes.length; i++) {
      if (starNodes[i].discovered) s.starsDiscovered++;
      if (starNodes[i].explored) s.starsExplored++;
      if (starNodes[i].owned) s.starsOwned++;
    }
    s.interstellarUnlocked = !!(stars.range);
    return s;
  }

  /**
   * Frontier priority, deterministic and documented:
   *   1. a solar destination that is ready AND affordable (cheapest first);
   *   2. a star that is ready to explore (nearest first);
   *   3. a solar destination that is available but unaffordable (cheapest);
   *   4. the last thing actually reached, so the control still centres content.
   * A destination that cannot be acted upon is never recommended above one
   * that can.
   */
  function pickFrontier(solarNodes, starNodes) {
    var ready = [];
    var blocked = [];
    var reached = [];
    var i;
    for (i = 0; i < solarNodes.length; i++) {
      var n = solarNodes[i];
      if (n.state === 'ready' && n.actionable) ready.push(n);
      else if (n.state === 'blocked') blocked.push(n);
      else if (n.visibility === 'visible') reached.push(n);
    }
    ready.sort(function (a, b) { return (a.cost || 0) - (b.cost || 0); });
    blocked.sort(function (a, b) { return (a.cost || 0) - (b.cost || 0); });
    if (ready.length) return ready[0];

    var starReady = [];
    for (i = 0; i < starNodes.length; i++) {
      if (starNodes[i].actionable) starReady.push(starNodes[i]);
    }
    if (starReady.length) return starReady[0];       // already distance-sorted

    if (blocked.length) return blocked[0];
    return reached.length ? reached[reached.length - 1] : null;
  }

  /**
   * A cheap signature of everything that changes STRUCTURE (lock, exploration,
   * ownership, selection, discovery). The view re-projects only when it moves.
   */
  function signature() {
    var parts = [];
    var i;
    for (i = 0; i < SOLAR.length; i++) {
      var id = SOLAR[i][0];
      var row = byId(id);
      parts.push(id + ':' + (rowLocked(row) ? 0 : 1) + (rowSelected(row) ? 's' : ''));
    }
    parts.push('L' + (window.rocketLaunched === true ? 1 : 0));
    parts.push('E' + exploredList().length);

    var stars = window.Game && window.Game.interstellar && window.Game.interstellar.stars;
    if (stars && stars.entries) {
      var ids = Object.keys(stars.entries);
      var discovered = 0;
      var explored = 0;
      var owned = 0;
      for (i = 0; i < ids.length; i++) {
        var data = stars.entries[ids[i]];
        if (data.explored) explored++;
        if (data.owned) owned++;
        if (!rowLocked(byId('star_' + ids[i]))) discovered++;
      }
      parts.push('S' + discovered + '/' + explored + '/' + owned);
    }
    parts.push('R' + (interstellarRocketBuilt() ? 1 : 0));
    return parts.join('|');
  }

  /* ========================================================================= *
   * Public surface — diagnostics and the view's data source. No setters.
   * ========================================================================= */

  window.SpaceCompanyCelestialModel = {
    version: 'm4',
    SOLAR: SOLAR,
    SURVEY_ONLY: SURVEY_ONLY,
    RING_LABEL: RING_LABEL,
    build: build,
    signature: signature,
    /* Exposed read-only helpers for tests and the view. */
    rocketFuel: rocketFuel,
    antimatter: antimatter,
    publishedFuelCost: publishedFuelCost,
    commsRange: commsRange,
    interstellarRocketBuilt: interstellarRocketBuilt,
    formatNumber: formatNumber
  };
})();
