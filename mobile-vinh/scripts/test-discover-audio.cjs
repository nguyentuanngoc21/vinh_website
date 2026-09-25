/* global __dirname */
// Discovery (6b) and audio (6c) with fake clients: no real searches, plays or saved positions.
const { readFileSync } = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
function load(file, imports = {}, globals = {}) {
  const code = ts.transpileModule(readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', ...Object.keys(globals), code)(name => imports[name], exports, ...Object.values(globals));
  return exports;
}
const ME = '00000000-0000-0000-0000-00000000000a';
const response = load('src/lib/mobile/response.ts');
process.env.MOBILE_SUPABASE_URL = 'https://mobile.supabase.co';
process.env.MOBILE_SUPABASE_PUBLISHABLE_KEY = 'publishable';
process.env.MOBILE_SUPABASE_SERVICE_ROLE_KEY = 'service-secret';

test('read context: publishable key + caller token so RLS applies; never the service key', async () => {
  const created = [];
  const ctx = load('src/lib/mobile/request-context.ts', {
    '@supabase/supabase-js': { createClient: (url, key, opts) => {
      created.push({ url, key, headers: opts.global?.headers ?? {} });
      return { auth: { getUser: async (t) => (t === 'good' ? { data: { user: { id: ME } }, error: null } : { data: { user: null }, error: 'bad' }) } };
    } },
    '@/lib/supabase/server': { createServiceRoleClient: () => { throw Error('must not use the web service client'); } },
    '@/lib/wallet/session': { getAuthedUserId: async () => null },
  });
  const guest = await ctx.getReadContext(new Request('https://api.test/x'));
  assert.equal(guest.userId, null);
  const signedIn = await ctx.getReadContext(new Request('https://api.test/x', { headers: { Authorization: 'Bearer good' } }));
  assert.equal(signedIn.userId, ME);
  await assert.rejects(ctx.getReadContext(new Request('https://api.test/x', { headers: { Authorization: 'Bearer bad' } })));
  await assert.rejects(ctx.getReadContext(new Request('https://api.test/x', { headers: { Authorization: 'Basic x' } })));
  assert.ok(created.every(c => c.key === 'publishable'), 'service-role key used for a public read');
  assert.deepEqual(created[1].headers, { Authorization: 'Bearer good' });
});

const readCtx = (userId) => ({ getReadContext: async () => ({ client: fakeClient(), userId }), requestError: () => Response.json({}, { status: 401 }) });
function fakeClient() {
  return {
    storage: { from: () => ({ getPublicUrl: (p) => ({ data: { publicUrl: `https://cdn/${p}` } }) }) },
    from() { const q = { select() { return q; }, in() { return q; }, then: (r) => r({ data: [{ id: 'a1', audio_url: 'x/a1.mp3' }], error: null }) }; return q; },
  };
}
test('discover: recommendations only for signed-in callers; guests still get the home sections', async () => {
  const recommendedFor = [];
  const mk = (userId) => load('src/app/api/mobile/discover/route.ts', {
    '@/lib/mobile/request-context': readCtx(userId), '@/lib/mobile/response': response,
    '@/lib/home/get-homepage-books': { getHomepageData: async () => ({ featured: [1], newest: [], weeklyRanking: [], trending: null }) },
    '@/lib/recommendations/get-recommended-books': { getRecommendedBooks: async (_c, id) => { recommendedFor.push(id); return [{ id: 'b1' }]; } },
  });
  const guest = await (await mk(null).GET(new Request('https://api.test/x'))).json();
  assert.deepEqual(guest.recommended, []); assert.deepEqual(guest.featured, [1]);
  const me = await (await mk(ME).GET(new Request('https://api.test/x'))).json();
  assert.deepEqual(me.recommended, [{ id: 'b1' }]); assert.deepEqual(recommendedFor, [ME]);
});
test('search: same three web searches, audio gets a playable URL; empty query does nothing', async () => {
  const queries = [];
  const route = load('src/app/api/mobile/search/route.ts', {
    '@/lib/mobile/request-context': readCtx(null), '@/lib/mobile/response': response,
    '@/lib/search/search-books': { searchBooks: async (_c, q) => { queries.push(q); return [{ id: 'b1' }]; } },
    '@/lib/search/search-audio': { searchAudio: async () => [{ id: 'a1', title: 'T' }] },
    '@/lib/search/search-design': { searchDesign: async () => [] },
  });
  assert.deepEqual(await (await route.GET(new Request('https://api.test/x?q=%20%20'))).json(), { books: [], audio: [], designs: [] });
  const res = await (await route.GET(new Request(`https://api.test/x?q=${encodeURIComponent('  Ngọc ')}`))).json();
  assert.deepEqual(queries, ['Ngọc']);
  assert.deepEqual(res.audio, [{ id: 'a1', title: 'T', audioUrl: 'https://cdn/x/a1.mp3' }]);
});
test('rankings: real periods from the web, trimmed to the top 50', async () => {
  const long = Array.from({ length: 80 }, (_, i) => ({ id: `b${i}` }));
  const route = load('src/app/api/mobile/rankings/route.ts', {
    '@/lib/mobile/request-context': readCtx(null), '@/lib/mobile/response': response,
    '@/lib/rankings/get-book-rankings': { getBookRankings: async () => ({ tuan: { range: 'r', list: long, leaders: [] }, toanthoigian: { range: 'a', list: long.slice(0, 3), leaders: [] } }) },
  });
  const body = await (await route.GET(new Request('https://api.test/x'))).json();
  assert.equal(body.tuan.list.length, 50); assert.equal(body.tuan.list[0].id, 'b0'); assert.equal(body.toanthoigian.list.length, 3);
});

function audioService({ session = ME } = {}) {
  const upserts = []; const posts = [];
  const client = {
    auth: { getSession: async () => ({ data: { session: session ? { user: { id: session } } : null } }) },
    from() { const q = { select() { return q; }, eq() { return q; }, order() { return q; }, limit() { return q; }, abortSignal() { return q; },
      upsert(row, opts) { upserts.push([row, opts]); return q; }, then: (r) => r({ data: [{ audio_narration_id: 'a1', position_seconds: 42, updated_at: 't' }], error: null }) }; return q; },
  };
  const service = load('mobile-vinh/src/services/audio.ts', { './supabase': { requireSupabase: () => client }, './api': { mobileApi: async () => ({}) } }, {
    process: { env: { EXPO_PUBLIC_API_URL: 'https://api.test/' } }, fetch: async (url, opts) => { posts.push([url, opts.method]); return new Response('{}'); },
  });
  return { service, upserts, posts };
}
test('listening progress uses the same audio_progress rows as the web; play count hits the web route', async () => {
  const f = audioService();
  assert.deepEqual(await f.service.getListeningProgress(ME), [{ audioId: 'a1', positionSeconds: 42, updatedAt: 't' }]);
  await f.service.saveListeningProgress(ME, 'a1', 61.9);
  assert.equal(f.upserts[0][0].position_seconds, 61); assert.equal(f.upserts[0][0].user_id, ME);
  assert.deepEqual(f.upserts[0][1], { onConflict: 'user_id,audio_narration_id' });
  await f.service.saveListeningProgress(ME, 'a1', -3);
  assert.equal(f.upserts.length, 1);
  await f.service.recordPlay('a1');
  assert.deepEqual(f.posts, [['https://api.test/api/audio/a1/play', 'POST']]);
  const other = audioService({ session: '00000000-0000-0000-0000-00000000000c' });
  await assert.rejects(other.service.saveListeningProgress(ME, 'a1', 10));
  assert.equal(other.upserts.length, 0);
});
test('audio comments route: comment, delete, like; nothing else', async () => {
  const calls = [];
  const h = (name) => async (req, c) => { calls.push({ name, method: req.method, body: req.body ? await req.json() : null, params: await c.params }); return Response.json({ ok: true }); };
  const route = load('src/app/api/mobile/audio/[audioNarrationId]/comments/route.ts', {
    '@/app/api/audio/[audioNarrationId]/comments/route': { GET: h('list'), POST: h('comment') },
    '@/app/api/audio/[audioNarrationId]/comments/[commentId]/route': { DELETE: h('delete') },
    '@/app/api/audio/[audioNarrationId]/comments/[commentId]/like/route': { POST: h('like') },
    '@/lib/mobile/response': response,
  });
  const params = { params: Promise.resolve({ audioNarrationId: 'a1' }) };
  const send = (body) => route.POST(new Request('https://api.test/x', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify(body) }), params);
  await send({ action: 'comment', content: 'Hay', parentCommentId: null, likeCount: 99 });
  await send({ action: 'like', commentId: 'k1' });
  await send({ action: 'delete', commentId: 'k1' });
  assert.deepEqual(calls.map(c => [c.name, c.method, c.body, c.params.commentId]), [
    ['comment', 'POST', { content: 'Hay', parentCommentId: null }, undefined], ['like', 'POST', null, 'k1'], ['delete', 'DELETE', null, 'k1']]);
  assert.equal((await send({ action: 'share-token' })).status, 400);
});
