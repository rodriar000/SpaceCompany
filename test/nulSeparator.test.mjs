/*
 * M5a — the formatter cache key separator must be an EXPLICIT escape, never a
 * literal NUL byte in the source.
 *
 * `ui/modern/uiRuntime.js` originally embedded U+0000 directly in the two
 * separator string literals. The runtime behaviour was correct, but a raw NUL
 * makes the file "binary" to text tooling: `git diff` reported `Bin ... bytes`
 * instead of a reviewable diff, `file(1)` reported "data", and grep refused to
 * print matches — so the hottest function in the application became the one
 * file nobody could review.
 *
 * The fix keeps the separator's RUNTIME value at U+0000 (it is still the ideal
 * separator: it cannot occur in a formatter name, a digit count or a number)
 * and only changes how that value is SPELLED in source. These tests lock both
 * halves of that: no literal NUL in any tracked text file, and the escape must
 * still evaluate to U+0000 and produce the same keys as before.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT } from './helpers/loadLegacy.mjs';

const RUNTIME = join(ROOT, 'ui/modern/uiRuntime.js');
const raw = readFileSync(RUNTIME);
const src = raw.toString('utf8');

const NUL = String.fromCharCode(0);

/* ========================================================================== *
 * 1-2. The source is text, and spells the separator explicitly
 * ========================================================================== */

test('uiRuntime.js contains zero literal NUL bytes', () => {
  assert.equal(raw.indexOf(0), -1,
    'a literal NUL makes the file binary to git, grep and file(1)');
});

test('the cache key separator is written as an explicit escape', () => {
  const keyLine = src.split('\n').find((l) => /var key =/.test(l));
  assert.ok(keyLine, 'the cache key construction was not found');
  assert.match(keyLine, /\\u0000/,
    'the separator must be spelled \\u0000 so its intent is explicit in source');
  assert.equal((keyLine.match(/\\u0000/g) || []).length, 2,
    'both separators must use the escape');
  assert.ok(!keyLine.includes(NUL), 'no raw NUL may remain on the key line');
});

/* ========================================================================== *
 * 3-5. The runtime value and key semantics are unchanged
 * ========================================================================== */

test('the escaped separator evaluates to U+0000', () => {
  // Evaluate exactly what the source now contains.
  const sep = eval("'\\u0000'"); // eslint-disable-line no-eval
  assert.equal(sep.length, 1);
  assert.equal(sep.charCodeAt(0), 0);
  assert.equal(sep, NUL, 'the runtime separator must still be U+0000');
});

test('cache keys are identical to the pre-correction literal-NUL keys', () => {
  const escaped = eval("'\\u0000'"); // eslint-disable-line no-eval
  const keyBefore = (f, d, v) => f + NUL + d + NUL + v;
  const keyAfter = (f, d, v) => f + escaped + d + escaped + v;

  const cases = [
    ['formatEveryThirdPower', 0, 0],
    ['formatEveryThirdPower', 2, 1234567],
    ['formatScientific', 3, -0.5],
    ['shortName', 0, 1e21],
    ['shortName', 1, 999]
  ];
  for (const c of cases) {
    assert.equal(keyAfter(...c), keyBefore(...c),
      'the key for ' + JSON.stringify(c) + ' changed');
  }
});

test('distinct formatter / precision / value triples stay distinct', () => {
  const sep = eval("'\\u0000'"); // eslint-disable-line no-eval
  const key = (f, d, v) => f + sep + d + sep + v;

  // The separator exists to stop field boundaries from blurring: without it
  // ("a",1,23) and ("a",12,3) would both flatten to "a123".
  assert.notEqual(key('a', 1, 23), key('a', 12, 3));
  assert.notEqual(key('shortName', 0, 1), key('shortNam', 0, 1));
  assert.notEqual(key('shortName', 0, 1), key('shortName', 1, 1));
  assert.notEqual(key('shortName', 0, 1), key('shortName', 0, 11));

  // A separator that could appear inside a field would be unsafe; U+0000
  // cannot occur in a formatter name, a digit count or a JS number's toString.
  const fields = ['formatEveryThirdPower', 'shortName', String(3), String(-1.5e300), String(1e21)];
  for (const f of fields) assert.ok(!f.includes(sep), f + ' must not contain the separator');
});

/* ========================================================================== *
 * 6. The memo still behaves exactly as before
 * ========================================================================== */

test('the memo contract is untouched by the correction', () => {
  assert.match(src, /MAX_CACHE = 4096/, 'capacity is unchanged');
  assert.match(src, /cache = Object\.create\(null\)/, 'clear-on-full eviction is unchanged');
  assert.match(src, /typeof value !== 'number' \|\| !isFinite\(value\)/,
    'non-finite input must still bypass the cache and reach the original');
  assert.match(src, /memoised\.__scOriginal = original/, 'the original stays reachable for parity checks');
});

/* ========================================================================== *
 * 7. Repository-wide: no tracked text file may contain a literal NUL
 * ========================================================================== */

test('no tracked text or source file contains a literal NUL byte', () => {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 })
    .toString('utf8').split('\0').filter(Boolean);

  // Genuine binaries are expected to contain NUL; text/source files are not.
  const TEXT = /\.(js|mjs|cjs|css|html?|json|md|ya?ml|txt|svg|map)$/i;
  const offenders = [];
  for (const f of files) {
    if (!TEXT.test(f)) continue;
    const bytes = readFileSync(join(ROOT, f));
    if (bytes.indexOf(0) !== -1) offenders.push(f);
  }
  assert.deepEqual(offenders, [],
    'these tracked text files contain literal NUL bytes and read as binary: ' + offenders.join(', '));
});
