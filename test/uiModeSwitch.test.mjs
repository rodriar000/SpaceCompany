/*
 * M1 UI-mode switch: functional characterization of ui/modern/shell.js.
 *
 * Loads the real shell script in a vm sandbox with a minimal DOM and asserts:
 *   - default -> modern; ?ui=legacy -> legacy;
 *   - the mode is derived from the URL only;
 *   - the switch NEVER reads or writes localStorage (i.e. cannot touch the save).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shellSrc = readFileSync(join(ROOT, 'ui/modern/shell.js'), 'utf8');

/** Build a minimal DOM sandbox; localStorage throws if touched at all. */
function runShell(search) {
  let localStorageTouched = false;
  const attrs = { 'data-ui': 'modern' };
  const docEl = {
    getAttribute: (k) => (k in attrs ? attrs[k] : null),
    setAttribute: (k, v) => { attrs[k] = v; },
  };
  const sandbox = {
    console,
    document: {
      documentElement: docEl,
      readyState: 'complete',
      getElementById: () => null,
      querySelector: () => null,
      addEventListener: () => {},
      createElement: () => ({ setAttribute() {}, className: '' }),
    },
    window: {
      location: { search },
    },
  };
  // Any access to localStorage (global or window.localStorage) flips the flag
  // and throws — proving the shell never touches it. Defined via getters so the
  // trap only fires on real access, not during sandbox setup.
  const trap = {
    get() { localStorageTouched = true; throw new Error('shell must not touch localStorage'); },
    configurable: true,
  };
  Object.defineProperty(sandbox, 'localStorage', trap);
  Object.defineProperty(sandbox.window, 'localStorage', trap);
  sandbox.self = sandbox.window;

  const ctx = vm.createContext(sandbox);
  vm.runInContext(shellSrc, ctx, { filename: 'ui/modern/shell.js' });
  return {
    mode: sandbox.window.SpaceCompanyShell && sandbox.window.SpaceCompanyShell.mode,
    dataUi: attrs['data-ui'],
    localStorageTouched,
  };
}

test('default (no query) resolves to modern', () => {
  const r = runShell('');
  assert.equal(r.mode, 'modern');
  assert.equal(r.dataUi, 'modern');
});

test('?ui=legacy resolves to legacy', () => {
  const r = runShell('?ui=legacy');
  assert.equal(r.mode, 'legacy');
  assert.equal(r.dataUi, 'legacy');
});

test('?ui=legacy among other params still resolves to legacy', () => {
  assert.equal(runShell('?debug=1&ui=legacy').mode, 'legacy');
  assert.equal(runShell('?ui=legacy&x=2').mode, 'legacy');
});

test('an unrelated ui value falls back to modern', () => {
  assert.equal(runShell('?ui=fancy').mode, 'modern');
  assert.equal(runShell('?theme=legacy').mode, 'modern', 'only ui=legacy triggers legacy');
});

test('the mode switch never touches localStorage', () => {
  assert.equal(runShell('').localStorageTouched, false);
  assert.equal(runShell('?ui=legacy').localStorageTouched, false);
  // Belt-and-suspenders on the CODE (comments stripped, so doc mentions of the
  // save key do not count): no localStorage / save-key reference in real code.
  const codeOnly = shellSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert.doesNotMatch(codeOnly, /localStorage/, 'shell.js code must not reference localStorage');
  assert.doesNotMatch(codeOnly, /["']save["']/, 'shell.js code must not reference the save key');
});
