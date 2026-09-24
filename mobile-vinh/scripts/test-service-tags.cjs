/* global __dirname */
const { readFileSync } = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');
const code = ts.transpileModule(readFileSync(path.resolve(__dirname, '../../src/lib/orders/validate-service-tags.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const api = {};
new Function('exports', code)(api);
const options = [{ group_key: 'g1', label: 'A', multi: true }, { group_key: 'g1', label: 'B', multi: true }, { group_key: 'g3', label: 'C', multi: false }];
test('classification preserves multi, single and incomplete draft selections', () => {
  for (const tags of [{}, { g1: [], g3: '' }, { g1: ['A', 'B'], g3: 'C' }]) assert.equal(api.validateServiceTags(tags, options), true);
});
test('classification rejects unknown groups/options, duplicate values and wrong selection shapes', () => {
  for (const tags of [null, [], { g1: 'A' }, { g3: ['C'] }, { g1: ['A', 'A'] }, { g1: ['C'] }, { v1: ['A'] }, { g3: 3 }]) {
    assert.equal(api.validateServiceTags(tags, options), false);
  }
});
