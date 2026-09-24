/* global __dirname */
const { readFileSync } = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');
function setup(result) {
  const calls = [];
  const query = {};
  for (const name of ['select', 'eq', 'is', 'ilike', 'order', 'range', 'abortSignal']) {
    query[name] = (...args) => { calls.push([name, ...args]); return query; };
  }
  query.maybeSingle = async () => result;
  query.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  const client = { from: table => { calls.push(['from', table]); return query; } };
  const code = ts.transpileModule(readFileSync(path.join(__dirname, '../src/services/books.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const api = {};
  new Function('require', 'exports', code)(() => ({ requireSupabase: () => client }), api);
  return { api, calls };
}
test('chapter pagination requests public metadata only and uses stable ordered ranges', async () => {
  const f = setup({ data: [], error: null });
  assert.deepEqual(await f.api.getChapterPage('book', 50), []);
  assert.ok(f.calls.some(c => c[0] === 'select' && c[1] === 'id,title,order_index,price'));
  for (const expected of [['eq', 'book_id', 'book'], ['eq', 'published', true], ['is', 'removed_at', null],
    ['order', 'order_index'], ['order', 'id'], ['range', 50, 99]]) {
    assert.ok(f.calls.some(c => JSON.stringify(c) === JSON.stringify(expected)));
  }
  await assert.rejects(f.api.getChapterPage('book', -1));
  await assert.rejects(f.api.getChapterPage('book', 0.5));
});
test('missing books and database errors are not presented as empty successful results', async () => {
  await assert.rejects(setup({ data: null, error: null }).api.getBook('gone'), /đã được gỡ/);
  const f = setup({ data: null, error: { message: 'network' } });
  await assert.rejects(f.api.getBook('book'), /Không tải/);
  await assert.rejects(f.api.getChapterPage('book'), /Không tải/);
});
test('search queries beyond the homepage cap and treats percent and underscore literally', async () => {
  const f = setup({ data: [{ id: 'outside-homepage' }], error: null });
  assert.equal((await f.api.searchBooks('  100%_  ', 80))[0].id, 'outside-homepage');
  for (const expected of [['ilike', 'title', '%100\\%\\_%'], ['range', 80, 99],
    ['eq', 'published', true], ['is', 'deleted_at', null]]) {
    assert.ok(f.calls.some(c => JSON.stringify(c) === JSON.stringify(expected)));
  }
});
test('search rejects invalid inputs and reports network failure instead of no matches', async () => {
  const f = setup({ data: [], error: null });
  for (const term of ['', '   ', '*', 'a'.repeat(121)]) await assert.rejects(f.api.searchBooks(term));
  await assert.rejects(f.api.searchBooks('truyện', -1));
  assert.equal(f.calls.length, 0);
  await assert.rejects(setup({ data: null, error: { message: 'offline' } }).api.searchBooks('truyện'), /Không tìm kiếm/);
});
