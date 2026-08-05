/*
 * Package metadata integrity.
 *
 * `package-lock.json` mirrors the root package's own fields, but npm only
 * refreshes them when the lockfile is regenerated — so an edit to
 * `package.json` can leave the lockfile asserting something different, and
 * `npm ci` will NOT complain. That is exactly how the root licence drifted:
 * package.json said "SEE LICENSE IN LICENCE.txt" while the lockfile still
 * claimed "MIT". These assertions make any future drift fail loudly.
 *
 * Fix drift with `npm install --package-lock-only`, never by hand.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));
const rootEntry = lock.packages[''];

test('the lockfile describes the same root package as package.json', () => {
  assert.equal(rootEntry.name, pkg.name);
  assert.equal(rootEntry.version, pkg.version);
});

test('the declared licence agrees between package.json and the lockfile', () => {
  assert.equal(rootEntry.license, pkg.license,
    'run `npm install --package-lock-only` to reconcile — do not hand-edit');
});

test('the declared licence points at a licence file that exists', () => {
  const match = /^SEE LICENSE IN (.+)$/.exec(pkg.license);
  assert.ok(match, `package.json licence must reference a file, got "${pkg.license}"`);
  const file = match[1].trim();
  assert.ok(existsSync(join(ROOT, file)), `${file} must exist`);
  assert.ok(readFileSync(join(ROOT, file), 'utf8').trim().length > 0, `${file} must not be empty`);
});

test('the original author\'s copyright is preserved in the licence file', () => {
  // The fork keeps upstream's MIT grant and copyright line; package.json points
  // at the file precisely so this attribution is read, not paraphrased.
  const licence = readFileSync(join(ROOT, 'LICENCE.txt'), 'utf8');
  assert.match(licence, /MIT License/i);
  assert.match(licence, /Copyright \(c\) 2017 sparticle999/);
});

test('the project stays dependency-free at runtime and in the lockfile', () => {
  assert.deepEqual(pkg.dependencies ?? {}, {}, 'no runtime dependencies');
  assert.deepEqual(pkg.devDependencies ?? {}, {}, 'no dev dependencies (zero-dep toolchain)');
  const installed = Object.keys(lock.packages).filter((k) => k !== '');
  assert.deepEqual(installed, [], `lockfile must install nothing, found: ${installed.join(', ')}`);
});

test('the engines floor matches the documented Node requirement', () => {
  assert.equal(pkg.engines.node, '>=18');
  const nvmrc = readFileSync(join(ROOT, '.nvmrc'), 'utf8').trim();
  assert.ok(Number.parseInt(nvmrc, 10) >= 18, `.nvmrc (${nvmrc}) must satisfy engines.node`);
});
