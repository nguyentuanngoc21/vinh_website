/* global __dirname */
const { readFileSync } = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');
function setup({ user = 'alice', failWrite = false, missingChapter = false } = {}) {
  const writes = []; const calls = []; let progress = null; let activeWrites = 0; let maximumWrites = 0;
  const client = {
    auth: { getSession: async () => ({ data: { session: user ? { user: { id: user } } : null } }) },
    from(table) {
      const call = { table, filters: [], operation: 'select', value: null, options: null }; calls.push(call);
      const query = {
        select() { return query; }, order() { return query; }, abortSignal() { return query; },
        eq(key, value) { call.filters.push([key, value]); return query; },
        is(key, value) { call.filters.push([key, value]); return query; },
        in(key, value) { call.filters.push([key, value]); return query; },
        upsert(value, options) { call.operation = 'upsert'; call.value = value; call.options = options; return query; },
        insert(value) { call.operation = 'insert'; call.value = value; return query; },
        delete() { call.operation = 'delete'; return query; },
        maybeSingle() { return result(true); }, single() { return result(true); },
        then(resolve, reject) { return result(false).then(resolve, reject); },
      };
      async function result(single) {
        if (table === 'book_progress' && call.operation === 'upsert') {
          activeWrites++; maximumWrites = Math.max(maximumWrites, activeWrites);
          await new Promise(resolve => setTimeout(resolve, 5)); activeWrites--;
          if (failWrite) { failWrite = false; return { error: { message: 'network failure' } }; }
          writes.push(call.value); progress = call.value; return { error: null };
        }
        if (table === 'book_progress') return { data: single ? progress : progress ? [progress] : [], error: null };
        if (table === 'chapters') return { data: missingChapter ? null : { id: progress.chapter_id }, error: null };
        if (table === 'reading_lists') return { data: single ? { id: 'new', name: call.value.name } : [{ id: 'list', name: 'Web list' }], error: null };
        if (table === 'reading_list_items') return { data: [{ list_id: 'list', book_id: 'book' }, { list_id: 'list', book_id: 'removed' }], error: null };
        if (table === 'books') return { data: [{ id: 'book', title: 'Published book' }], error: null };
        throw Error('Unexpected table ' + table);
      }
      return query;
    },
  };
  const code = ts.transpileModule(readFileSync(path.join(__dirname, '../src/services/library.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const imports = { './supabase': { requireSupabase: () => client }, './books': { getFirstChapter: async () => 'first' } };
  const api = {};
  new Function('require', 'exports', code)(name => imports[name], api);
  return { api, writes, calls, max: () => maximumWrites };
}
test('restoration only applies to the same chapter and clamps edited content', () => {
  const { api } = setup();
  assert.equal(api.resumeIndex({ chapter_id: 'a', last_paragraph_index: 200 }, 'a', 10), 9);
  assert.equal(api.resumeIndex({ chapter_id: 'a', last_paragraph_index: 5 }, 'b', 10), 0);
  assert.equal(api.resumeIndex(null, 'a', 10), 0);
  assert.equal(api.resumeIndex({ chapter_id: 'a', last_paragraph_index: 5 }, 'a', 0), 0);
});
test('serial writes keep the new chapter and its paragraph together', async () => {
  const f = setup();
  await Promise.all([f.api.saveProgress('alice', 'book', 'old', 22), f.api.saveProgress('alice', 'book', 'new', 0)]);
  assert.equal(f.max(), 1);
  const p = await f.api.getProgress('alice', 'book');
  assert.equal(p.chapter_id, 'new'); assert.equal(p.last_paragraph_index, 0);
  assert.equal(f.writes[0].user_id, 'alice');
});
test('failed save does not break later saves; invalid indices never write', async () => {
  const f = setup({ failWrite: true });
  await assert.rejects(f.api.saveProgress('alice', 'book', 'a', 1));
  await f.api.saveProgress('alice', 'book', 'a', 2);
  await assert.rejects(f.api.saveProgress('alice', 'book', 'a', -1));
  assert.equal(f.writes.length, 1);
});
test('account switch prevents stale progress and bookmark writes', async () => {
  const f = setup({ user: 'bob' });
  await assert.rejects(f.api.saveProgress('alice', 'book', 'a', 1));
  await assert.rejects(f.api.setBookSaved('alice', 'list', 'book', true));
  await assert.rejects(f.api.getLibrary('alice'));
  assert.equal(f.calls.length, 0);
});
test('library combines web lists and progress, excludes inaccessible books', async () => {
  const f = setup(); await f.api.saveProgress('alice', 'book', 'a', 12);
  const rows = await f.api.getLibrary('alice');
  assert.equal(rows.length, 1); assert.equal(rows[0].lists[0].name, 'Web list');
  assert.equal(rows[0].progress.last_paragraph_index, 12);
  assert.ok(f.calls.find(c => c.table === 'books').filters.some(([key, value]) => key === 'published' && value === true));
});
test('removed chapter falls back to first available chapter', async () => {
  const f = setup({ missingChapter: true }); await f.api.saveProgress('alice', 'book', 'removed', 9);
  assert.equal(await f.api.openLibraryBook('alice', 'book'), 'first');
});
test('saving is idempotent and removing targets only one list membership', async () => {
  const f = setup();
  await f.api.setBookSaved('alice', 'list', 'book', true);
  assert.equal(f.calls[0].options.ignoreDuplicates, true);
  await f.api.setBookSaved('alice', 'list', 'book', false);
  assert.deepEqual(f.calls[1].filters, [['list_id', 'list'], ['book_id', 'book']]);
  await assert.rejects(f.api.createReadingList('alice', '   '));
});
