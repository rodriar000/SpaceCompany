/*
 * Narrowly-scoped test harness for the legacy Space Company code.
 *
 * The game's runtime is a browser environment: files declare mutable state as
 * top-level `var` globals and share it across ~45 <script> tags, coupling
 * heavily to jQuery and the DOM. To characterize the *pure* and
 * *state-serialization* behaviour WITHOUT altering runtime code, we load the
 * relevant source files into a single Node `vm` context that provides only the
 * minimal shims those files touch (a tiny jQuery-like `$`, a `window`, etc.).
 *
 * This harness never modifies the source files; it only supplies the ambient
 * globals the browser would otherwise provide, so we can observe real legacy
 * behaviour under test.
 */

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(__dirname, '..', '..');

/** Minimal jQuery-ish shim covering only what the loaded files reference. */
function makeJQueryShim() {
  // $.extend(target, ...sources): shallow merge, later sources win (jQuery semantics).
  function $() {
    // Selector calls return a chainable no-op element used by some UI helpers.
    return {
      tooltip() { return this; },
      text() { return this; },
      val() { return ''; },
      show() { return this; },
      hide() { return this; },
      css() { return ''; },
      fadeTo() { return this; },
      appendTo() { return this; },
      html() { return this; },
      width() { return 0; },
      get() { return { click() {} }; },
    };
  }
  $.extend = function extend(target, ...sources) {
    for (const src of sources) {
      if (src == null) continue;
      for (const key of Object.keys(src)) target[key] = src[key];
    }
    return target;
  };
  $.fn = {};
  return $;
}

/**
 * Create a fresh vm context with browser-ish globals, then run the given
 * source files (relative to repo root) in order. Returns the context so tests
 * can read the resulting globals (e.g. `ctx.uranium`, `ctx.Game`, `ctx.legacySave`).
 */
export function loadFiles(relativeFiles, extraGlobals = {}) {
  const sandbox = {
    console,
    Math,
    Date,
    JSON,
    Number,
    String,
    Array,
    Object,
    parseInt,
    parseFloat,
    isNaN,
    setTimeout: () => 0,
    setInterval: () => 0,
    clearInterval: () => {},
    requestAnimationFrame: () => 0,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.$ = makeJQueryShim();
  sandbox.jQuery = sandbox.$;
  Object.assign(sandbox, extraGlobals);

  const ctx = vm.createContext(sandbox);

  for (const rel of relativeFiles) {
    const code = readFileSync(join(ROOT, rel), 'utf8');
    vm.runInContext(code, ctx, { filename: rel });
  }
  return ctx;
}

/** Load a vendored library (e.g. lib/lz-string.min.js) and return the context. */
export function loadLibrary(relativeFile, extraGlobals = {}) {
  return loadFiles([relativeFile], extraGlobals);
}
