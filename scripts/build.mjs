#!/usr/bin/env node
/*
 * Deterministic build for Space Company (Rodrigo's modernization fork).
 *
 * Legacy context
 * --------------
 * The original project shipped a Grunt 0.4 pipeline (`grunt-contrib-concat` +
 * `grunt-contrib-uglify`) that concatenated a hand-maintained list of source
 * files into `SpaceCompany.min.js`. That pipeline was BROKEN and UNUSED:
 *   - `Gruntfile.js` referenced `loading.js`, which does not exist in the repo,
 *     so `grunt concat` would fail outright.
 *   - `index.html` loads ~45 individual <script> tags; the single-bundle
 *     `<script src="SpaceCompany.min.js">` line is commented out. The game has
 *     always run from the individual files, not the bundle.
 *
 * What this script does
 * ---------------------
 * It reproduces the *intent* of the legacy concat step deterministically:
 * it derives the ordered list of application scripts directly from
 * `index.html` (so ordering can never drift from what the browser actually
 * loads), concatenates them, and writes `SpaceCompany.min.js`.
 *
 * Behavioral-equivalence guarantees (see docs/LEGACY_ARCHITECTURE.md):
 *   - Source order is taken verbatim from index.html's live <script> tags.
 *   - Vendored libraries under lib/ are excluded (matching legacy Grunt intent);
 *     they remain separately referenced and are already minified.
 *   - Files are concatenated with a plain "\n" separator, exactly like the
 *     legacy grunt-contrib-concat default. No minification, transpilation,
 *     module-wrapping or tree-shaking is applied, because these legacy files
 *     share mutable state through top-level (global) `var` declarations, and
 *     any scoping/renaming transform would break that contract.
 *   - The banner contains no timestamp, so output is byte-for-byte
 *     reproducible (verify with `npm run build && sha256sum SpaceCompany.min.js`).
 *
 * The generated bundle is intentionally NOT wired into index.html in M0. It is
 * produced only to prove a deterministic, reproducible build path exists.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUTPUT_NAME = 'SpaceCompany.min.js';

/** Remove HTML comment blocks so commented-out <script> tags are ignored. */
function stripHtmlComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

/** Ordered list of local application scripts, derived from index.html. */
export function resolveScriptOrder(html) {
  const withoutComments = stripHtmlComments(html);
  const scriptTag = /<script\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/gi;
  const order = [];
  let match;
  while ((match = scriptTag.exec(withoutComments)) !== null) {
    const src = match[2].trim();
    if (/^https?:/i.test(src)) continue;      // remote (kongregate, GA, etc.)
    if (!src.endsWith('.js')) continue;        // ignore non-JS
    if (src.startsWith('lib/')) continue;      // vendored, pre-minified
    if (src === OUTPUT_NAME) continue;         // never bundle our own output
    if (!order.includes(src)) order.push(src);
  }
  return order;
}

function build() {
  const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const files = resolveScriptOrder(indexHtml);

  if (files.length === 0) {
    console.error('build: no application scripts found in index.html');
    process.exit(1);
  }

  const banner =
    '/*! Space Company - Rodrigo\'s modernization fork\n' +
    ' * Deterministic concatenation of application scripts (see scripts/build.mjs).\n' +
    ' * Original game (c) sparticle999 - https://github.com/sparticle999/SpaceCompany\n' +
    ' * NOTE: generated artifact; do not edit by hand and do not commit.\n' +
    ' */\n';

  const parts = [banner];
  for (const file of files) {
    const contents = readFileSync(join(ROOT, file), 'utf8');
    parts.push('/* ==== ' + file + ' ==== */');
    parts.push(contents);
  }
  const output = parts.join('\n');

  writeFileSync(join(ROOT, OUTPUT_NAME), output);

  const sha = createHash('sha256').update(output).digest('hex');
  console.log('build: concatenated ' + files.length + ' scripts -> ' + OUTPUT_NAME);
  console.log('build: bytes=' + Buffer.byteLength(output) + ' sha256=' + sha);
  for (const file of files) console.log('  + ' + file);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  build();
}
