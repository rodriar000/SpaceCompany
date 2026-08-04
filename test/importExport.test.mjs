/*
 * Save-safety characterization: import/export pipeline (game.js + lz-string).
 *
 * Export:  save object -> JSON.stringify -> LZString.compressToBase64 -> textarea.
 * Import:  textarea -> validate -> LZString.decompressFromBase64 -> localStorage.
 *
 * We drive the REAL Game.import / Game.export against the repo's own bundled
 * lz-string library, wiring a controllable input field and a localStorage stub
 * into the sandbox. This locks the exact rejection rules for empty / malformed
 * saves and the round-trip integrity of a valid save string.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFiles } from './helpers/loadLegacy.mjs';

/**
 * Build a sandbox with lz-string + game.js and a controllable #impexpField.
 * Returns { Game, setField, getField, store, reloaded }.
 */
function makeGame() {
  const state = { field: '', store: {}, reloaded: false };

  // Load the real global state (variable.js), the real save serializer
  // (saving.js -> legacySave/legacyLoad), the real lz-string library, and the
  // real Game object (game.js). Game.save() fans out to subsystem modules that
  // require the DOM/data files, so we stub ONLY those module save/load hooks;
  // the import guard, legacySave schema, and LZString stay under real test.
  const ctx = loadFiles(['variable.js', 'saving.js', 'lib/lz-string.min.js', 'game.js'], {
    PNotify: function () {},
  });

  const noop = { save() {}, load() {} };
  for (const m of ['achievements', 'statistics', 'resources', 'buildings',
    'tech', 'interstellar', 'stargaze', 'updates']) {
    ctx.Game[m] = { ...noop };
  }
  // saveNotifsEnabled=false makes notifyInfo("Game Saved", ...) return early.
  ctx.Game.settings = {
    entries: { saveNotifsEnabled: false, notificationsEnabled: false },
    save() {}, load() {},
  };

  // Controllable jQuery replacement: only #impexpField is used by import/export.
  ctx.$ = function () {
    return {
      val(v) {
        if (arguments.length) { state.field = v; return this; }
        return state.field;
      },
      tooltip() { return this; },
    };
  };
  // legacySave() uses $.extend(target, source) to merge globals into the save.
  ctx.$.extend = function (target, ...sources) {
    for (const src of sources) {
      if (src == null) continue;
      for (const k of Object.keys(src)) target[k] = src[k];
    }
    return target;
  };
  ctx.localStorage = {
    getItem: (k) => (k in state.store ? state.store[k] : null),
    setItem: (k, v) => { state.store[k] = v; },
    removeItem: (k) => { delete state.store[k]; },
  };
  // window === sandbox in the harness, so window.location resolves to ctx.location.
  ctx.location = { reload() { state.reloaded = true; } };

  return {
    Game: ctx.Game,
    LZString: ctx.LZString,
    setField: (v) => { state.field = v; },
    getField: () => state.field,
    state,
  };
}

test('export produces a base64 string whose length is a multiple of 4', () => {
  const h = makeGame();
  h.Game.export();
  const out = h.getField();
  assert.ok(out.length > 0, 'export writes a value');
  assert.equal(out.length % 4, 0, 'base64 is padded to a multiple of 4');
});

test('export -> import round-trips a save into localStorage', () => {
  const h = makeGame();
  // Seed a recognizable value, export, then import into a clean store.
  h.Game.export();
  const exported = h.getField();

  h.state.store = {}; // clear
  h.setField(exported);
  h.Game.import();

  assert.ok(h.state.store.save, 'a save was written to localStorage');
  // The stored save is valid JSON with the version stamp.
  const parsed = JSON.parse(h.state.store.save);
  assert.equal(parsed.versionNumber, 'V0.5.1.2 Beta');
  assert.equal(h.state.reloaded, true, 'import triggers a reload');
});

test('import rejects an empty / whitespace-only string', () => {
  const h = makeGame();
  h.setField('   ');
  h.Game.import();
  assert.equal(h.state.store.save, undefined, 'nothing written for empty input');
  assert.equal(h.state.reloaded, false);
});

test('import rejects a string whose length is not a multiple of 4', () => {
  const h = makeGame();
  h.setField('abc'); // length 3 -> fails the base64 length guard
  h.Game.import();
  assert.equal(h.state.store.save, undefined);
  assert.equal(h.state.reloaded, false);
});

test('import rejects undecompressable (garbage) base64', () => {
  const h = makeGame();
  // Length multiple of 4 but not valid LZString payload -> decompress yields falsy.
  h.setField('!!!!'); // length 4, decompresses to null/empty
  h.Game.import();
  assert.equal(h.state.store.save, undefined);
  assert.equal(h.state.reloaded, false);
});

test('LZString round-trip integrity for a representative payload', () => {
  const h = makeGame();
  const payload = JSON.stringify({ metal: 123456789, researched: ['a', 'b'], flag: true });
  const compressed = h.LZString.compressToBase64(payload);
  assert.equal(h.LZString.decompressFromBase64(compressed), payload);
  assert.equal(h.LZString.decompressFromBase64('!!!!') || '', '');
});
