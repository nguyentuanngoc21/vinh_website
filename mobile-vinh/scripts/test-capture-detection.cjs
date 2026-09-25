/* global __dirname */
// Web reader screenshot/copy detection (can deduct xu via /api/penalty) — only real shortcuts count.
const { readFileSync } = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');
const code = ts.transpileModule(readFileSync(path.resolve(__dirname, '../../src/lib/reading/capture-detection.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const lib = {}; new Function('require', 'exports', code)(() => ({}), lib);
const key = (k, mods = {}) => ({ key: k, code: mods.code, metaKey: !!mods.meta, ctrlKey: !!mods.ctrl, shiftKey: !!mods.shift, altKey: !!mods.alt });

test('typing a capital S (Shift+S) or Alt+S is not a capture shortcut any more', () => {
  assert.equal(lib.isCaptureShortcut(key('S', { shift: true })), false);
  assert.equal(lib.isCaptureShortcut(key('s', { alt: true })), false);
  assert.equal(lib.isCaptureShortcut(key('s')), false);
});
test('real capture/save shortcuts still count', () => {
  for (const e of [key('PrintScreen'), key('Unidentified', { code: 'PrintScreen' }), key('F13'),
    key('s', { ctrl: true }), key('s', { meta: true }), key('S', { meta: true, shift: true }), key('S', { ctrl: true, shift: true })])
    assert.equal(lib.isCaptureShortcut(e), true, JSON.stringify(e));
});
test('form fields are ignored', () => {
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) assert.equal(lib.isEditableTarget({ tagName }), true);
  assert.equal(lib.isEditableTarget({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(lib.isEditableTarget({ tagName: 'P' }), false);
  assert.equal(lib.isEditableTarget(null), false);
});
