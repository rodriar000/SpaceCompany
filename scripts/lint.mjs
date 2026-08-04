#!/usr/bin/env node
/*
 * Static syntax check for the legacy application scripts.
 *
 * The legacy codebase is sloppy-mode, browser-global JavaScript. A strict
 * linter (ESLint with `no-undef`) would drown the signal in thousands of
 * cross-file global references that are correct by design. What actually
 * protects us during modernization is guaranteeing that every source file
 * still *parses* as valid JavaScript. This script runs `node --check` (V8's
 * parser, no execution) against every first-party application script.
 *
 * Vendored libraries under lib/ and the generated bundle are excluded.
 */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { readdirSync, statSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const EXCLUDE_DIRS = new Set(['lib', 'node_modules', '.git', 'Icons', 'fonts', 'styles', 'scripts', 'test']);
const EXCLUDE_FILES = new Set(['SpaceCompany.min.js', 'Gruntfile.js']);

/** Collect first-party .js files (root + data/ + ui/), excluding vendored code. */
function collect(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = full.slice(ROOT.length + 1);
    const top = rel.split('/')[0];
    if (statSync(full).isDirectory()) {
      if (EXCLUDE_DIRS.has(entry)) continue;
      collect(full, acc);
    } else if (entry.endsWith('.js') && !EXCLUDE_FILES.has(entry)) {
      if (EXCLUDE_DIRS.has(top)) continue;
      acc.push(rel);
    }
  }
  return acc;
}

const files = collect(ROOT).sort();
let failures = 0;

for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', join(ROOT, file)], { stdio: 'pipe' });
    console.log('  ok  ' + file);
  } catch (err) {
    failures++;
    console.error('FAIL  ' + file);
    process.stderr.write((err.stderr || err.stdout || Buffer.from(String(err))).toString());
  }
}

console.log('\nlint: checked ' + files.length + ' files, ' + failures + ' failure(s)');
process.exit(failures === 0 ? 0 : 1);
