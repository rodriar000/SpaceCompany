/* ============================================================================
 * Space Company — Canonical Technology Graph Projection (first-party, M3)
 *
 * A READ-ONLY adapter that projects the legacy research system into a graph
 * the modern research view can render. It is a *lens*, never an engine.
 *
 * WHERE TRUTH LIVES (never here):
 *   - `Game.techData`      canonical static definitions + canonical ORDER
 *   - `Game.tech.entries`  live `current` / `unlocked` per technology
 *   - `getCost(base, n)`   canonical price curve for the next level
 *   - `window.science`     the resource `Game.tech.hasResources` actually reads
 *   - `purchaseTech(id)`   the one and only way a technology is bought
 *
 * WHAT THIS FILE MAY DO:
 *   - read the above and derive presentation facts (state, depth, lane, …)
 *   - derive dependency edges from the canonical `newTechs` arrays
 *
 * WHAT THIS FILE MUST NEVER DO:
 *   - write ANY gameplay value (`current`, `unlocked`, `researched`,
 *     `available`, `resourcesUnlocked`, `tabsUnlocked`, a resource, the save)
 *   - call `apply` / `onApply` / `buyTech` / `gainTech` / `unlockTech`
 *   - invent a prerequisite that `newTechs` does not state
 *   - use a formatted string as numeric truth
 *
 * See docs/M3_TECHNOLOGY_CONTRACT.md for the full boundary.
 * ==========================================================================*/
(function () {
  'use strict';

  /* ========================================================================= *
   * Presentation-only taxonomy
   *
   * Lanes are a VISUAL grouping so the map reads as themed progression tracks.
   * They carry NO gameplay meaning: nothing in the game reads them, no effect,
   * cost, prerequisite or unlock is derived from them, and changing one only
   * moves a node to a different horizontal band. A technology with no entry
   * falls back to the `frontier` lane rather than being dropped.
   * ========================================================================= */

  var LANES = [
    { key: 'industry', title: 'Industry & Extraction' },
    { key: 'power', title: 'Power & Storage' },
    { key: 'space', title: 'Space Programme' },
    { key: 'science', title: 'Scientific Method' },
    { key: 'solcenter', title: 'Sol Center' },
    { key: 'frontier', title: 'Uncategorised' },
    /* Populated by the layout, not by LANE_OF — see `STANDALONE_LANE`. */
    { key: 'standalone', title: 'Standing programmes · no prerequisites' }
  ];

  /**
   * Technologies with neither a prerequisite nor a successor are their own
   * one-node "tree". Left in a thematic band each one occupies a whole grid row
   * with a single card at column 0, which is what made the map read as mostly
   * emptiness. They are collected into one band at the foot of the map and
   * packed side by side instead.
   *
   * The trade-off, recorded in docs/M3_TECHNOLOGY_GRAPH.md: inside THIS band the
   * horizontal position is packing order, not topological stage. Every node in
   * it has depth 0 by definition, so no stage information is lost — there is
   * simply nothing for a column to encode.
   */
  var STANDALONE_LANE = 'standalone';

  var LANE_OF = {
    unlockStorage: 'industry',
    unlockOil: 'industry',
    unlockBasicEnergy: 'industry',
    unlockSolar: 'industry',
    unlockMachines: 'industry',
    unlockDestruction: 'industry',
    upgradeEngineTech: 'industry',
    upgradeResourceTech: 'industry',
    efficiencyResearch: 'industry',

    upgradeSolarTech: 'power',
    unlockBatteries: 'power',
    unlockBatteriesT2: 'power',
    unlockBatteriesT3: 'power',
    unlockBatteriesT4: 'power',
    energyEfficiencyResearch: 'power',
    batteryEfficiencyResearch: 'power',

    unlockSolarSystem: 'space',
    unlockRocketFuelT2: 'space',
    unlockRocketFuelT3: 'space',

    unlockLabT2: 'science',
    unlockLabT3: 'science',
    unlockLabT4: 'science',
    scienceEfficiencyResearch: 'science',

    unlockPlasma: 'solcenter',
    unlockPlasmaTier2: 'solcenter',
    unlockPSU: 'solcenter',
    unlockPSUT2: 'solcenter',
    unlockEmc: 'solcenter',
    unlockMeteorite: 'solcenter',
    unlockMeteoriteTier1: 'solcenter',
    unlockMeteoriteTier2: 'solcenter',
    unlockDyson: 'solcenter',
    unlockDysonSphere: 'solcenter'
  };

  /* ========================================================================= *
   * Observed external unlock sites
   *
   * Some technologies are unlocked by code OUTSIDE any `newTechs` array. These
   * are NOT turned into graph edges — inventing a prerequisite the data does
   * not state would misrepresent the game. They are recorded here as honest
   * provenance notes shown in the inspector, and verified by the test suite
   * against the real source files.
   * ========================================================================= */

  var EXTERNAL_UNLOCKS = {
    unlockPlasma: 'Unlocked at the Sol Center by the Plasma research project (solCenter.js).',
    unlockEmc: 'Unlocked at the Sol Center by the EMC research project (solCenter.js).',
    unlockDyson: 'Unlocked at the Sol Center by the Dyson research project (solCenter.js).',
    unlockPSU: 'Unlocked once Plasma Tier 1 Technology is researched (core.js), not via its tech data.',
    efficiencyResearch: 'Revealed once your science stock passes its base cost (science.js).',
    scienceEfficiencyResearch: 'Revealed once your science stock passes its base cost (science.js).',
    energyEfficiencyResearch: 'Revealed once your science stock passes its base cost (science.js).',
    batteryEfficiencyResearch: 'Revealed once your science stock passes its base cost (science.js).'
  };

  /** The one tab id any technology can open; used only for an effect label. */
  var TAB_LABELS = { solarSystemTab: 'Solar System' };

  /* ========================================================================= *
   * Safe canonical readers — every one of these is READ-ONLY
   * ========================================================================= */

  function techDefinitions() {
    var game = window.Game;
    return (game && game.techData) || null;
  }

  /** Live entry if the tech subsystem has initialised, else the static default. */
  function liveEntry(id, definitions) {
    var game = window.Game;
    var entries = game && game.tech && game.tech.entries;
    if (entries && entries[id]) return entries[id];
    return definitions[id];
  }

  function readScience() {
    var value = Number(window.science);
    if (!isNaN(value)) return value;
    if (typeof window.getResource === 'function' && window.RESOURCE) {
      value = Number(window.getResource(window.RESOURCE.Science));
      if (!isNaN(value)) return value;
    }
    return 0;
  }

  /**
   * Price of the NEXT level, mirroring `Game.tech.buyTech(id, 1)` exactly:
   * a never-purchased technology uses its predefined base cost, otherwise the
   * canonical `getCost` curve is applied at the current level.
   */
  function nextCost(entry) {
    var base = (entry.cost && Number(entry.cost.science)) || 0;
    if (entry.current > 0) {
      if (typeof window.getCost === 'function') return Number(window.getCost(base, entry.current));
      return Math.floor(base * Math.pow(1.1, entry.current));
    }
    return base;
  }

  function formatNumber(value) {
    var settings = window.Game && window.Game.settings;
    if (settings && typeof settings.format === 'function') {
      try {
        return String(settings.format(value));
      } catch (e) {
        /* fall through */
      }
    }
    return String(value);
  }

  /* ========================================================================= *
   * Derived facts
   * ========================================================================= */

  /**
   * `buyTech` refuses when a positive `maxLevel` is already reached. Note this
   * deliberately does NOT use `Game.tech.isMaxLevel`, which special-cases
   * `energyEfficiencyResearch` to always report false even at 25/25 (a legacy
   * quirk that keeps its legacy row visible). Purchasability must follow the
   * code that actually spends science.
   */
  function canStillBuy(entry) {
    return !(entry.maxLevel > 0 && entry.current >= entry.maxLevel);
  }

  function classifyType(entry) {
    if (entry.maxLevel < 0) return 'repeatable';
    if (entry.maxLevel > 1) return 'levelled';
    return entry.type === 1 ? 'unlock' : 'upgrade';
  }

  /** Factual, non-inventive effect chips derived from canonical fields only. */
  function effectsOf(entry) {
    var out = [];
    var i;
    for (i = 0; i < entry.newTabs.length; i++) {
      var tab = entry.newTabs[i];
      out.push('Opens the ' + (TAB_LABELS[tab] || tab) + ' tab');
    }
    if (entry.newResources.length) {
      out.push(entry.newResources.length === 1
        ? 'Unlocks 1 resource or panel'
        : 'Unlocks ' + entry.newResources.length + ' resources or panels');
    }
    if (entry.newTechs.length) {
      out.push(entry.newTechs.length === 1
        ? 'Opens 1 further technology'
        : 'Opens ' + entry.newTechs.length + ' further technologies');
    }
    if (typeof entry.onApply === 'function') out.push('Applies a permanent production upgrade');
    if (entry.maxLevel < 0) out.push('Repeatable without limit');
    else if (entry.maxLevel > 1) out.push('Up to ' + entry.maxLevel + ' levels');
    return out;
  }

  /* ========================================================================= *
   * Graph construction — deterministic, cycle-safe, reference-validated
   * ========================================================================= */

  /**
   * Build the projection.
   *
   * Ordering is taken verbatim from `Game.techData`'s key order, which is the
   * same order `Game.tech.initialise` walks, so node order is stable across
   * calls and across reloads.
   */
  function build() {
    var definitions = techDefinitions();
    if (!definitions) return null;

    var order = Object.keys(definitions);
    var nodes = [];
    var byId = Object.create(null);
    var diagnostics = { missingReferences: [], duplicateEdges: [], cycles: [], orphans: [] };
    var science = readScience();

    /* -- 1. nodes ---------------------------------------------------------- */
    var i;
    for (i = 0; i < order.length; i++) {
      var id = order[i];
      var entry = liveEntry(id, definitions);
      var cost = nextCost(entry);
      var purchased = entry.current > 0;
      var buyable = canStillBuy(entry);

      var node = {
        id: id,
        index: i,
        name: entry.name,
        desc: entry.desc,
        actionLabel: entry.buttonText,
        type: classifyType(entry),
        canonicalType: entry.type,
        costType: entry.costType,

        cost: cost,                       // numeric truth
        costText: formatNumber(cost),     // display only
        science: science,
        affordable: science >= cost,
        missing: Math.max(0, cost - science),

        current: entry.current,
        maxLevel: entry.maxLevel,
        repeatable: entry.maxLevel < 0,
        levelled: entry.maxLevel > 1,
        purchased: purchased,
        unlocked: entry.unlocked === true,
        buyable: buyable,

        newResources: entry.newResources.slice(),
        newTechs: entry.newTechs.slice(),
        newTabs: entry.newTabs.slice(),
        tabAlerts: entry.tabAlerts.slice(),
        hasOnApply: typeof entry.onApply === 'function',
        effects: effectsOf(entry),

        externalUnlock: Object.prototype.hasOwnProperty.call(EXTERNAL_UNLOCKS, id),
        externalUnlockNote: EXTERNAL_UNLOCKS[id] || null,

        prerequisites: [],
        children: [],
        lane: LANE_OF[id] || 'frontier',
        depth: 0,
        visibility: 'undiscovered',
        state: 'undiscovered'
      };
      nodes.push(node);
      byId[id] = node;
    }

    /* -- 2. edges, derived ONLY from canonical `newTechs` ------------------- */
    var edges = [];
    var seen = Object.create(null);
    for (i = 0; i < nodes.length; i++) {
      var parent = nodes[i];
      for (var c = 0; c < parent.newTechs.length; c++) {
        var childId = parent.newTechs[c];
        var key = parent.id + '>' + childId;
        if (seen[key]) { diagnostics.duplicateEdges.push(parent.id + '->' + childId); continue; }
        seen[key] = true;
        var child = byId[childId];
        if (!child) { diagnostics.missingReferences.push(parent.id + '->' + childId); continue; }
        parent.children.push(childId);
        child.prerequisites.push(parent.id);
        edges.push({ from: parent.id, to: childId });
      }
    }

    /* -- 3. depth = longest path from a root, cycle-safe -------------------- */
    var depthCache = Object.create(null);
    function depthOf(node, guard) {
      if (depthCache[node.id] !== undefined) return depthCache[node.id];
      if (guard[node.id]) return 0;              // a cycle: stop, never recurse
      guard[node.id] = true;
      var best = 0;
      for (var p = 0; p < node.prerequisites.length; p++) {
        var value = depthOf(byId[node.prerequisites[p]], guard) + 1;
        if (value > best) best = value;
      }
      delete guard[node.id];
      depthCache[node.id] = best;
      return best;
    }
    for (i = 0; i < nodes.length; i++) nodes[i].depth = depthOf(nodes[i], Object.create(null));

    /* -- 4. cycle report (diagnostic only; layout is already cycle-safe) ---- */
    var colour = Object.create(null);
    function visit(node, stack) {
      colour[node.id] = 1;
      stack.push(node.id);
      for (var k = 0; k < node.children.length; k++) {
        var next = byId[node.children[k]];
        if (colour[next.id] === 1) {
          diagnostics.cycles.push(stack.slice(stack.indexOf(next.id)).concat(next.id).join('->'));
        } else if (!colour[next.id]) {
          visit(next, stack);
        }
      }
      stack.pop();
      colour[node.id] = 2;
    }
    for (i = 0; i < nodes.length; i++) if (!colour[nodes[i].id]) visit(nodes[i], []);

    /* -- 5. roots / terminals / orphans ------------------------------------- */
    var roots = [];
    var terminals = [];
    for (i = 0; i < nodes.length; i++) {
      if (!nodes[i].prerequisites.length) roots.push(nodes[i].id);
      if (!nodes[i].children.length) terminals.push(nodes[i].id);
      if (!nodes[i].prerequisites.length && !nodes[i].children.length) {
        diagnostics.orphans.push(nodes[i].id);
      }
    }

    /* -- 6. visibility & state --------------------------------------------- */
    applyVisibility(nodes, byId);

    /* -- 7. progression summary -------------------------------------------- */
    var stats = summarise(nodes);

    return {
      nodes: nodes,
      byId: byId,
      edges: edges,
      order: order,
      roots: roots,
      terminals: terminals,
      lanes: LANES,
      diagnostics: diagnostics,
      stats: stats,
      science: science
    };
  }

  /* ========================================================================= *
   * Visibility / spoiler policy
   *
   *   visible      canonically discovered — `unlocked` or already purchased.
   *                Name, cost, description and effects are shown.
   *   preview      an immediate successor of something visible. Its POSITION in
   *                the map is shown so progression direction is legible, but no
   *                name, cost or effect is revealed.
   *   undiscovered everything further out. Same concealment as `preview`, drawn
   *                more faintly.
   *
   * Concealment is enforced HERE, in the model: `publicName`, `publicCost` and
   * `publicEffects` are the only fields the view is allowed to render, so a
   * future view change cannot leak content by accident.
   * ========================================================================= */

  function applyVisibility(nodes, byId) {
    var i;
    for (i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      node.visibility = (node.unlocked || node.purchased) ? 'visible' : 'undiscovered';
    }
    /* One pass: a direct successor of anything visible becomes a preview. */
    for (i = 0; i < nodes.length; i++) {
      if (nodes[i].visibility !== 'visible') continue;
      for (var c = 0; c < nodes[i].children.length; c++) {
        var child = byId[nodes[i].children[c]];
        if (child && child.visibility === 'undiscovered') child.visibility = 'preview';
      }
    }
    for (i = 0; i < nodes.length; i++) finaliseState(nodes[i]);
  }

  function finaliseState(node) {
    var revealed = node.visibility === 'visible';

    if (!revealed) {
      node.state = node.visibility;                 // 'preview' | 'undiscovered'
      node.publicName = 'Undiscovered';
      node.publicDesc = 'This technology has not been discovered yet.';
      node.publicCost = null;
      node.publicCostText = '—';
      node.publicEffects = [];
      node.publicLevel = null;
      node.actionable = false;
      return;
    }

    node.publicName = node.name;
    node.publicDesc = node.desc;
    node.publicEffects = node.effects.slice();

    if (!node.buyable) {
      node.state = 'maxed';
      node.publicCost = null;
      node.publicCostText = 'N/A';
      node.actionable = false;
    } else {
      node.state = node.affordable ? 'ready' : 'blocked';
      node.publicCost = node.cost;
      node.publicCostText = node.costText;
      node.actionable = true;
    }

    /* A one-shot technology that is bought is history, not a to-do. */
    if (node.maxLevel === 1 && node.purchased) node.state = 'researched';
    /* A levelled/repeatable technology that has been bought at least once but
       can still advance reads as "in progress", not as a fresh unlock. */
    else if (node.purchased && node.buyable) node.state = 'progressing';

    if (node.repeatable) {
      /* The type chip already says "Repeatable"; repeating it here read as
         "Repeatable · Level 1 · repeatable" on the node. */
      node.publicLevel = 'Level ' + node.current;
    } else if (node.levelled) {
      node.publicLevel = 'Level ' + node.current + ' / ' + node.maxLevel;
    } else {
      node.publicLevel = null;
    }
  }

  /* ========================================================================= *
   * Progression summary
   *
   * The denominator is the count of ONE-SHOT technologies (`maxLevel === 1`).
   * Levelled and repeatable research is excluded because "percent complete" is
   * undefined for an unbounded track — including them would either cap the bar
   * below 100% forever or require inventing a weighting. Documented in
   * docs/M3_TECHNOLOGY_GRAPH.md.
   * ========================================================================= */

  function summarise(nodes) {
    var stats = {
      total: nodes.length,
      oneShot: 0,
      completed: 0,
      available: 0,
      affordable: 0,
      undiscovered: 0,
      levelsOwned: 0,
      percent: 0
    };
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      stats.levelsOwned += node.current;
      if (node.maxLevel === 1) {
        stats.oneShot++;
        if (node.purchased) stats.completed++;
      }
      if (node.visibility !== 'visible') { stats.undiscovered++; continue; }
      if (node.actionable) {
        stats.available++;
        if (node.affordable) stats.affordable++;
      }
    }
    stats.percent = stats.oneShot ? Math.floor((stats.completed / stats.oneShot) * 100) : 0;
    return stats;
  }

  /* ========================================================================= *
   * Deterministic layout
   *
   * Column = topological depth, so progression always flows LEFT -> RIGHT.
   * Row    = a tidy-tree assignment inside the node's lane band, with an
   *          occupancy check that makes cell collisions impossible even if the
   *          data later grows a shape this heuristic did not anticipate.
   *
   * Geometry is computed from grid indices and fixed cell constants only — no
   * DOM measurement — so the layout is identical in the browser and under test,
   * costs nothing to recompute, and never depends on viewport size.
   * ========================================================================= */

  /* `padY` reserves a header strip at the top of the canvas so the stage
     labels and the first lane label never share a line. */
  var CELL = {
    width: 216, height: 150, colGap: 60, rowGap: 18, padX: 24, padY: 84,
    /* Separation between lane bands. A whole blank grid row would cost ~170px
       five times over and make the map read as mostly emptiness. */
    bandGap: 46
  };

  function layout(graph) {
    var laneOrder = {};
    var l;
    for (l = 0; l < LANES.length; l++) laneOrder[LANES[l].key] = l;

    /* Group nodes by lane, preserving canonical order inside each lane. */
    var buckets = {};
    for (l = 0; l < LANES.length; l++) buckets[LANES[l].key] = [];
    var i;
    for (i = 0; i < graph.nodes.length; i++) {
      var member = graph.nodes[i];
      member.packed = !member.prerequisites.length && !member.children.length;
      /* Keep `lane` and the band a node is drawn in the same thing, so nothing
         downstream can label a card with a band it is not actually in. The
         thematic LANE_OF entry still applies if the data ever gives it edges. */
      if (member.packed) member.lane = STANDALONE_LANE;
      buckets[member.lane].push(member);
    }

    var occupied = Object.create(null);
    var bands = [];
    var row = 0;

    /**
     * DFS pre-order placement inside one lane. A subtree keeps a contiguous
     * block of rows, which is what stops branches from interleaving; the
     * `occupied` map then guarantees two nodes can never share a cell even if
     * the data later grows a shape this heuristic did not anticipate.
     */
    function place(node, cursor, inLane, placed) {
      if (placed[node.id]) return cursor;
      placed[node.id] = true;

      var target = cursor;
      while (occupied[node.depth + ':' + target]) target++;
      occupied[node.depth + ':' + target] = node.id;
      node.row = target;
      node.col = node.depth;

      /* The FIRST child continues on the parent's own row, so a linear chain
         reads as one straight horizontal run; later siblings fan downwards. */
      var childCursor = target;
      for (var k = 0; k < node.children.length; k++) {
        var child = graph.byId[node.children[k]];
        if (child && inLane[child.id]) childCursor = place(child, childCursor, inLane, placed);
      }
      return Math.max(target + 1, childCursor);
    }

    /* Widest column any tree reaches; the standalone band wraps to match. */
    var maxDepth = 0;
    for (i = 0; i < graph.nodes.length; i++) {
      if (!graph.nodes[i].packed && graph.nodes[i].depth > maxDepth) maxDepth = graph.nodes[i].depth;
    }
    var perRow = Math.max(1, maxDepth + 1);

    for (l = 0; l < LANES.length; l++) {
      var lane = LANES[l];
      var members = buckets[lane.key];
      if (!members.length) continue;

      if (lane.key === STANDALONE_LANE) {
        var startRow = row;
        for (i = 0; i < members.length; i++) {
          members[i].col = i % perRow;
          members[i].row = startRow + Math.floor(i / perRow);
          occupied[members[i].col + ':' + members[i].row] = members[i].id;
        }
        row = startRow + Math.ceil(members.length / perRow);
        bands.push({
          key: lane.key,
          title: lane.title,
          from: startRow,
          to: Math.max(startRow, row - 1),
          index: bands.length
        });
        continue;
      }

      var inLane = Object.create(null);
      for (i = 0; i < members.length; i++) inLane[members[i].id] = true;

      var bandStart = row;
      var placed = Object.create(null);

      /* Sub-roots: nodes with no prerequisite inside this lane. A cross-lane
         parent starts a new strand here, which is exactly how a branch such as
         "Machines opens the Space Programme" should read. */
      for (i = 0; i < members.length; i++) {
        var node = members[i];
        var internalParent = false;
        for (var p = 0; p < node.prerequisites.length; p++) {
          if (inLane[node.prerequisites[p]]) { internalParent = true; break; }
        }
        if (!internalParent) row = place(node, row, inLane, placed);
      }
      /* Anything a cycle or odd shape left unplaced still gets a stable cell. */
      for (i = 0; i < members.length; i++) {
        if (!placed[members[i].id]) row = place(members[i], row, inLane, placed);
      }

      bands.push({
        key: lane.key,
        title: lane.title,
        from: bandStart,
        to: Math.max(bandStart, row - 1),
        index: bands.length
      });
    }

    /* Each node inherits its band's pixel offset, so bands separate without
       burning a whole grid row on white space. */
    var offsetOfRow = Object.create(null);
    for (l = 0; l < bands.length; l++) {
      for (var r = bands[l].from; r <= bands[l].to; r++) offsetOfRow[r] = bands[l].index * CELL.bandGap;
    }

    /* Absolute geometry. */
    var maxCol = 0;
    var maxRow = 0;
    for (i = 0; i < graph.nodes.length; i++) {
      var n = graph.nodes[i];
      if (n.col === undefined) { n.col = n.depth; n.row = 0; }
      n.x = CELL.padX + n.col * (CELL.width + CELL.colGap);
      n.y = CELL.padY + n.row * (CELL.height + CELL.rowGap) + (offsetOfRow[n.row] || 0);
      n.w = CELL.width;
      n.h = CELL.height;
      if (n.col > maxCol) maxCol = n.col;
      if (n.row > maxRow) maxRow = n.row;
    }

    /* A band is drawn around the cells it actually occupies, not across the
       whole canvas: a lane that only starts at stage 3 would otherwise render
       as a large empty bordered box for its first two stages. */
    for (l = 0; l < bands.length; l++) {
      var band = bands[l];
      var offset = band.index * CELL.bandGap;
      band.y = CELL.padY + band.from * (CELL.height + CELL.rowGap) + offset - 12;
      band.height = (band.to - band.from + 1) * (CELL.height + CELL.rowGap) - CELL.rowGap + 24;

      var left = Infinity;
      var right = -Infinity;
      for (i = 0; i < graph.nodes.length; i++) {
        var occupant = graph.nodes[i];
        if (occupant.row < band.from || occupant.row > band.to) continue;
        if (occupant.x < left) left = occupant.x;
        if (occupant.x + CELL.width > right) right = occupant.x + CELL.width;
      }
      band.x = left === Infinity ? CELL.padX : left - 14;
      band.width = right === -Infinity ? CELL.width : (right - band.x) + 14;
    }

    var lastBand = bands[bands.length - 1];
    var canvas = {
      width: CELL.padX * 2 + (maxCol + 1) * CELL.width + maxCol * CELL.colGap,
      height: (lastBand ? lastBand.y + lastBand.height : CELL.padY) + CELL.padY,
      columns: maxCol + 1,
      rows: maxRow + 1
    };

    graph.layout = { cell: CELL, canvas: canvas, bands: bands };
    graph.connectors = routeConnectors(graph);
    return graph;
  }

  /**
   * Orthogonal elbow routing: leave the parent's right edge, run to a vertical
   * channel inside the gutter that follows the parent's column, then into the
   * child's left edge. Because the channel is derived from the parent column,
   * edges that span several columns never sit on top of a node.
   */
  function routeConnectors(graph) {
    var out = [];
    for (var i = 0; i < graph.edges.length; i++) {
      var edge = graph.edges[i];
      var from = graph.byId[edge.from];
      var to = graph.byId[edge.to];
      if (!from || !to) continue;

      var x1 = from.x + from.w;
      var y1 = from.y + from.h / 2;
      var x2 = to.x;
      var y2 = to.y + to.h / 2;

      /* The vertical leg runs in the gutter, never over a node. Two long edges
         leaving the same column would otherwise sit exactly on top of each
         other, so the channel is staggered by a deterministic function of the
         endpoints — same graph, same offsets, every time. */
      var stagger = (((from.row * 7 + to.row * 3) % 5) - 2) * 10;
      var channel = x1 + CELL.colGap / 2 + stagger;

      var path = 'M' + x1 + ' ' + y1 +
        ' H' + channel +
        ' V' + y2 +
        ' H' + x2;

      /* A connector is "live" when the prerequisite is genuinely satisfied. */
      var status = from.purchased ? 'complete' : (from.visibility === 'visible' ? 'active' : 'dormant');

      /* A small solid head at the child end so the direction of progression is
         explicit, not merely implied by the left-to-right convention. */
      var head = 'M' + x2 + ' ' + y2 +
        ' L' + (x2 - 8) + ' ' + (y2 - 4.5) +
        ' L' + (x2 - 8) + ' ' + (y2 + 4.5) + ' Z';

      out.push({
        from: edge.from,
        to: edge.to,
        path: path,
        head: head,
        status: status,
        x1: x1, y1: y1, x2: x2, y2: y2
      });
    }
    return out;
  }

  /* ========================================================================= *
   * Public surface — diagnostics + the view's data source. No setters.
   * ========================================================================= */

  window.SpaceCompanyTechGraph = {
    version: 'm3',
    LANES: LANES,
    LANE_OF: LANE_OF,
    EXTERNAL_UNLOCKS: EXTERNAL_UNLOCKS,
    CELL: CELL,

    /** Build + lay out the projection. Returns null if tech data is absent. */
    build: function () {
      var graph = build();
      return graph ? layout(graph) : null;
    },

    /**
     * A cheap signature of everything that changes TOPOLOGY or node state
     * (unlocked / level). The view rebuilds only when this string changes;
     * affordability alone is handled by a much cheaper per-tick pass.
     */
    structureSignature: function () {
      var definitions = techDefinitions();
      if (!definitions) return '';
      var order = Object.keys(definitions);
      var parts = [];
      for (var i = 0; i < order.length; i++) {
        var entry = liveEntry(order[i], definitions);
        parts.push(order[i] + ':' + (entry.unlocked ? 1 : 0) + ':' + entry.current);
      }
      return parts.join('|');
    },

    /* Exposed for tests and the view; all read-only helpers. */
    readScience: readScience,
    nextCost: nextCost,
    canStillBuy: canStillBuy,
    formatNumber: formatNumber
  };
})();
