/*
 * Characterization: the tick engine, offline-gain boundary, and the
 * reset/rebirth guard (game.js).
 *
 * - Game.createInterval/update is the accumulator that drives every periodic
 *   task (production, UI, autosave). We verify a callback fires only once its
 *   accumulated delta crosses the configured delay.
 * - handleOfflineGains must be a no-op for non-positive elapsed time (the guard
 *   that protects against clock skew / negative offline durations).
 * - deleteSave must only wipe storage when the user types the exact word
 *   "DELETE" (irreversible-action guard).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFiles } from './helpers/loadLegacy.mjs';

function makeGame(overrides = {}) {
  const state = { store: { save: 'PRESENT' }, reloaded: false, alerts: [], promptReturn: '' };
  const ctx = loadFiles(['game.js'], {
    PNotify: function () {},
    prompt: () => state.promptReturn,
    alert: (m) => state.alerts.push(m),
    localStorage: {
      getItem: (k) => (k in state.store ? state.store[k] : null),
      setItem: (k, v) => { state.store[k] = v; },
      removeItem: (k) => { delete state.store[k]; },
    },
    ...overrides,
  });
  ctx.location = { reload() { state.reloaded = true; } };
  return { Game: ctx.Game, state };
}

test('createInterval fires a callback only after its delay accumulates', () => {
  const { Game } = makeGame();
  let fired = 0;
  Game.createInterval('probe', () => { fired += 1; }, 1000); // 1000 ms delay

  Game.update(500);
  assert.equal(fired, 0, 'not enough elapsed time yet');

  Game.update(600); // total 1100 > 1000
  assert.equal(fired, 1, 'fires once threshold crossed');

  // Accumulator resets after firing.
  Game.update(500);
  assert.equal(fired, 1, 'does not re-fire until threshold crossed again');
});

test('deleteInterval removes a scheduled task', () => {
  const { Game } = makeGame();
  let fired = 0;
  Game.createInterval('probe', () => { fired += 1; }, 100);
  Game.deleteInterval('probe');
  Game.update(1000);
  assert.equal(fired, 0);
});

test('handleOfflineGains is a no-op for non-positive elapsed time', () => {
  const { Game } = makeGame();
  // These would throw if they proceeded (refreshPerSec/gainResources are absent),
  // so returning cleanly proves the boundary guard short-circuits first.
  assert.doesNotThrow(() => Game.handleOfflineGains(0));
  assert.doesNotThrow(() => Game.handleOfflineGains(-5));
});

test('deleteSave keeps the save when the confirmation word is wrong', () => {
  const { Game, state } = makeGame();
  state.promptReturn = 'delete'; // wrong case
  Game.deleteSave();
  assert.equal(state.store.save, 'PRESENT', 'save must be preserved');
  assert.equal(state.reloaded, false);
  assert.deepEqual(state.alerts, ['Deletion Cancelled']);
});

test('deleteSave wipes the save only on exact "DELETE"', () => {
  const { Game, state } = makeGame();
  state.promptReturn = 'DELETE';
  Game.deleteSave();
  assert.equal('save' in state.store, false, 'save removed');
  assert.equal(state.reloaded, true, 'page reloads after reset');
  assert.deepEqual(state.alerts, ['Deleted Save']);
});
