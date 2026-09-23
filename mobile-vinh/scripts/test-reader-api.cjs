/* global __dirname */
// Execute the real route with a fake database: no production writes or test users.
const { readFileSync } = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
function load(file, imports = {}) {
  const code = ts.transpileModule(readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => imports[name], exports);
  return exports;
}
const preview = load('src/lib/reading/access-gate.ts');
const id = '00000000-0000-0000-0000-000000000001';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-public';
function setup({ paid = false, viewer = null, purchased = false, purchaseError = false, missing = false } = {}) {
  let contentReads = 0;
  const client = {
    auth: { getUser: async () => ({ data: { user: viewer ? { id: viewer } : null }, error: viewer ? null : 'Invalid' }) },
    from(table) {
      let columns;
      const query = {
        select(value) { columns = value; return query; },
        eq() { return query; }, is() { return query; }, order() { return query; },
        maybeSingle() { return Promise.resolve(result()); },
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
      function result() {
        if (table === 'books') return { data: { id: 'book', title: 'Book', author_id: 'author' } };
        if (table === 'purchase_transactions') return { data: purchased ? { id: 'purchase' } : null, error: purchaseError ? 'Unavailable' : null };
        if (columns === 'content') { contentReads++; return { data: { content: 'One\n\nTwo\n\nThree\n\nFour' } }; }
        if (columns === 'id') return { data: [{ id }, { id: 'next' }] };
        return { data: missing ? null : { id, book_id: 'book', title: 'Chapter', price: paid ? 20 : 0 } };
      }
      return query;
    },
  };
  const route = load('src/app/api/mobile/chapters/[chapterId]/route.ts', {
    '@supabase/supabase-js': { createClient: () => client }, '@/lib/reading/access-gate': preview,
  });
  return { route, reads: () => contentReads,
    get: (token = viewer ? 'valid' : null, chapterId = id) => route.GET(new Request('http://localhost/api/mobile/chapters/' + chapterId,
      { headers: token ? { Authorization: 'Bearer ' + token } : {} }), { params: Promise.resolve({ chapterId }) }) };
}
test('guest gets preview only, with uncached response', async () => {
  const response = await setup().get();
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const body = await response.json();
  assert.equal(body.gate, 'login'); assert.equal(body.content, 'One\n\nTwo'); assert.equal(body.nextId, 'next');
});
test('guest and unpaid user cannot fetch paid content', async () => {
  for (const viewer of [null, 'reader']) {
    const fixture = setup({ paid: true, viewer });
    const body = await (await fixture.get()).json();
    assert.equal(body.gate, 'purchase'); assert.equal(body.content, ''); assert.equal(fixture.reads(), 0);
  }
});
test('purchased, author and authenticated free reader receive full content', async () => {
  for (const scenario of [{ paid: true, viewer: 'reader', purchased: true }, { paid: true, viewer: 'author' }, { viewer: 'reader' }]) {
    const body = await (await setup(scenario).get()).json();
    assert.equal(body.gate, 'none'); assert.equal(body.content, 'One\n\nTwo\n\nThree\n\nFour');
  }
});
test('purchase lookup failure denies content', async () => {
  const fixture = setup({ paid: true, viewer: 'reader', purchaseError: true });
  assert.equal((await fixture.get()).status, 502); assert.equal(fixture.reads(), 0);
});
test('invalid JWT, invalid ID and hidden chapter are rejected', async () => {
  assert.equal((await setup().get('invalid')).status, 401);
  assert.equal((await setup().get(null, 'bad-id')).status, 400);
  assert.equal((await setup({ missing: true }).get()).status, 404);
});
