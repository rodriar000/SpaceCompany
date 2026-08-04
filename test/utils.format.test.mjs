/*
 * Characterization: number & time formatting (utils.js).
 * These outputs are user-visible and relied on by the UI. Locking them guards
 * against accidental changes to how resources/time are displayed.
 *
 * NOTE ON LOCALE: `formatEveryThirdPower` (shortName/name formatters) calls
 * `Number.prototype.toLocaleString()` with NO locale argument, so the group and
 * decimal separators depend on the host locale (e.g. "12,345" vs "12.345").
 * That is genuine legacy behaviour. To keep these characterization tests
 * portable across machines and CI we normalize separators before asserting,
 * which still locks the significant digits, rounding and unit suffix.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFiles } from './helpers/loadLegacy.mjs';

const ctx = loadFiles(['utils.js'], { Game: {} });
const fmt = ctx.Game.utils;

/** Strip locale group/decimal separators so only digits + suffix remain. */
const norm = (s) => s.replace(/[.,]/g, '');

test('shortName abbreviates millions/billions to 4 significant digits', () => {
  assert.equal(norm(fmt.formatters.shortName(1234567)), '1235M');
  assert.equal(norm(fmt.formatters.shortName(2500000)), '2500M');
  assert.equal(norm(fmt.formatters.shortName(1000000000)), '1000B');
  assert.equal(norm(fmt.formatters.shortName(2500000000)), '2500B');
});

test('long name notation uses spelled-out units', () => {
  assert.equal(fmt.formatters.name(1000000000).replace(/[.,]/g, ''), '1000 billion');
  assert.equal(fmt.formatters.name(2500000).replace(/[.,]/g, ''), '2500 million');
});

test('values below one million are not abbreviated', () => {
  assert.equal(fmt.formatters.shortName(999), '999');
  assert.equal(norm(fmt.formatters.shortName(12345)), '12345');
});

test('scientific notation (locale-independent, uses toString)', () => {
  assert.equal(fmt.formatScientificNotation(12345, false), '1.23*10^4');
  assert.equal(fmt.formatScientificNotation(12345, true), '1.23E+4');
  // Small magnitudes fall through to raw formatting.
  assert.equal(fmt.formatScientificNotation(42, false), '42');
});

test('time display pads h:m:s', () => {
  assert.equal(fmt.getTimeDisplay(3661, true), '01:01:01');
  assert.equal(fmt.getTimeDisplay(0, true), '~~');
});

test('splitDateTime decomposes seconds into [y,d,h,m,s,ms]', () => {
  // result[5] is the sub-minute millisecond remainder (includes the whole
  // seconds), so 90s -> 1 min, 30 s, 30000 ms remainder.
  // Array.from re-homes the vm-realm array so deepStrictEqual compares values,
  // not prototype identity across realms.
  assert.deepEqual(Array.from(fmt.splitDateTime(90)), [0, 0, 0, 1, 30, 30000]);
  assert.deepEqual(Array.from(fmt.splitDateTime(3661)), [0, 0, 1, 1, 1, 1000]);
});

test('math helpers are stable', () => {
  assert.equal(fmt.fibonacci(10), 55);
  assert.equal(fmt.pascal(4), 10);
  assert.equal(fmt.capitaliseFirst('metal'), 'Metal');
});

test('prototype extensions loaded by utils.js', () => {
  assert.equal((5).clamp(0, 3), 3);
  assert.equal((-1).clamp(0, 3), 0);
  assert.equal('a{0}b{1}'.format('X', 'Y'), 'aXbY');
});
