/* global __dirname */
const { readFileSync } = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');
function setup({ owner = 'alice', type = 'illustration', denied = false, insertError = false } = {}) {
  const writes = [], filters = [], storage = [];
  const client = {
    from: table => {
      const q = { select: () => q, eq: (key, value) => { filters.push([table, key, value]); return q; },
        maybeSingle: async () => ({ data: { id: 'listing', seller_id: owner, service_type: type }, error: null }),
        insert: value => { writes.push(value); return q; },
        single: async () => ({ data: insertError ? null : { id: 'sample' }, error: insertError ? { message: 'test failure' } : null }),
        delete: () => { writes.push('delete'); return q; }, then: resolve => resolve({ error: null }),
      }; return q;
    },
    storage: { from: bucket => ({
      upload: async (key, file) => { storage.push(['upload', bucket, key, file.type]); return { error: null }; },
      remove: async keys => { storage.push(['remove', bucket, keys]); return { error: null }; },
    }) },
  };
  const imports = { 'next/server': { NextResponse: Response }, '@/lib/supabase/server': {},
    '@/lib/mobile/request-context': { getRequestContext: async () => { if (denied) throw new Error('unauthorized'); return { client, userId: 'alice' }; },
      requestError: () => Response.json({}, { status: 401 }) } };
  function load(file) {
    const code = ts.transpileModule(readFileSync(path.resolve(__dirname, '../../src/app/api/profile/services/[listingId]/samples', file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const api = {}; new Function('require', 'exports', code)(name => imports[name], api); return api;
  }
  return { writes, filters, storage,
    upload: async (mime = 'image/png', size = 1) => {
      const form = new FormData(); form.append('file', new File([new Uint8Array(size)], 'sample', { type: mime }));
      return load('route.ts').POST(new Request('https://local', { method: 'POST', body: form }), { params: Promise.resolve({ listingId: 'listing' }) });
    },
    remove: () => load('[sampleId]/route.ts').DELETE(new Request('https://local', { method: 'DELETE' }), { params: Promise.resolve({ listingId: 'listing', sampleId: 'sample' }) }),
  };
}
test('sample writes require authentication and ownership', async () => {
  for (const [options, status] of [[{ denied: true }, 401], [{ owner: 'bob' }, 404]]) {
    const f = setup(options);
    assert.equal((await f.upload()).status, status);
    assert.equal((await f.remove()).status, status);
    assert.deepEqual(f.writes, []); assert.deepEqual(f.storage, []);
  }
});
test('samples reject wrong media, empty/oversized files and ghostwriting uploads', async () => {
  for (const [options, mime, size] of [[{}, 'audio/mpeg', 1], [{ type: 'voice' }, 'image/png', 1], [{ type: 'ghostwriting' }, 'image/png', 1], [{}, 'image/png', 0], [{}, 'image/png', 15 * 1024 * 1024 + 1], [{}, 'text/html', 1]]) {
    const f = setup(options); assert.equal((await f.upload(mime, size)).status, 400); assert.deepEqual(f.storage, []);
  }
});
test('sample upload uses server-selected bucket and owner path', async () => {
  const f = setup({ type: 'voice' }); assert.equal((await f.upload('audio/mpeg')).status, 200);
  assert.equal(f.storage[0][1], 'audio-narrations');
  assert.match(f.storage[0][2], /^alice\/service-sample-listing-\d+\.mp3$/);
  assert.equal(f.writes[0].listing_id, 'listing');
});
test('failed metadata insert cleans up newly uploaded object', async () => {
  const f = setup({ insertError: true }); assert.equal((await f.upload()).status, 500);
  assert.deepEqual(f.storage[1], ['remove', 'design-images', [f.storage[0][2]]]);
});
test('removal is restricted to sample and listing and retains storage like web', async () => {
  const f = setup(); assert.equal((await f.remove()).status, 200);
  assert.ok(f.filters.some(([table, key, value]) => table === 'service_samples' && key === 'listing_id' && value === 'listing'));
  assert.ok(f.filters.some(([table, key, value]) => table === 'service_samples' && key === 'id' && value === 'sample'));
  assert.deepEqual(f.storage, []);
});
