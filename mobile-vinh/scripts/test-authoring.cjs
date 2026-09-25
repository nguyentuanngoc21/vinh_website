/* global __dirname */
// Phase 8a/8b authoring with fake clients: no real books, chapters or agreements are written.
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
  new Function('require', 'exports', ...Object.keys(globals), code)(name => {
    if (name in imports) return imports[name];
    throw new Error(`unexpected import ${name}`);
  }, exports, ...Object.values(globals));
  return exports;
}
const ME = '00000000-0000-0000-0000-00000000000a';
const OTHER = '00000000-0000-0000-0000-00000000000b';
const BOOK = '10000000-0000-0000-0000-000000000001';
const CH = (n) => `20000000-0000-0000-0000-00000000000${n}`;
const next = { NextResponse: Response };
const response = load('src/lib/mobile/response.ts');
const forward = load('src/lib/mobile/forward.ts');
const limits = load('src/lib/authoring/chapter-limits.ts');

process.env.MOBILE_SUPABASE_URL = 'https://mobile.supabase.co';
process.env.MOBILE_SUPABASE_PUBLISHABLE_KEY = 'publishable';
process.env.MOBILE_SUPABASE_SERVICE_ROLE_KEY = 'service-secret';

test('user context: Bearer → publishable key + caller token (RLS/auth.uid()); service key only via admin()', async () => {
  const created = [];
  const ctx = load('src/lib/mobile/request-context.ts', {
    '@supabase/supabase-js': { createClient: (url, key, opts) => {
      created.push({ url, key, headers: opts.global?.headers ?? {} });
      return { auth: { getUser: async (t) => (t === 'good' ? { data: { user: { id: ME } }, error: null } : { data: { user: null }, error: 'bad' }) } };
    } },
    '@/lib/supabase/server': {
      createClient: async () => ({ cookie: true, auth: { getUser: async () => ({ data: { user: { id: OTHER } } }) } }),
      createServiceRoleClient: () => ({ webAdmin: true }),
    },
    '@/lib/wallet/session': { getAuthedUserId: async () => null },
  });
  const bearer = await ctx.getUserContext(new Request('https://api.test/x', { headers: { Authorization: 'Bearer good' } }));
  assert.equal(bearer.userId, ME);
  assert.deepEqual(created.map(c => [c.url, c.key, c.headers.Authorization]), [['https://mobile.supabase.co', 'publishable', 'Bearer good']]);
  bearer.admin();
  assert.equal(created[1].key, 'service-secret', 'admin() must use the mobile project');
  await assert.rejects(ctx.getUserContext(new Request('https://api.test/x', { headers: { Authorization: 'Bearer bad' } })));
  await assert.rejects(ctx.getUserContext(new Request('https://api.test/x', { headers: { Authorization: 'Token x' } })));
  const web = await ctx.getUserContext(new Request('https://api.test/x'));
  assert.equal(web.userId, OTHER); assert.equal(web.supabase.cookie, true); assert.equal(web.admin().webAdmin, true);
});

// Minimal PostgREST-like fake: eq/in/is filters, maybeSingle, delete with count, rpc.
function fakeDb(tables, { rpc } = {}) {
  const log = [];
  function query(table) {
    const filters = []; let op = 'select'; let payload = null; let limitN = null;
    const rows = () => (tables[table] ?? []).filter(r => filters.every(f => f(r)));
    const q = {
      select() { return q; }, order() { return q; }, abortSignal() { return q; },
      eq(k, v) { filters.push(r => r[k] === v); return q; }, in(k, v) { filters.push(r => v.includes(r[k])); return q; },
      is(k, v) { filters.push(r => (r[k] ?? null) === v); return q; }, limit(n) { limitN = n; return q; },
      update(p) { op = 'update'; payload = p; return q; }, delete() { op = 'delete'; return q; }, insert(p) { op = 'insert'; payload = p; return q; },
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then(resolve) {
        const hit = rows().slice(0, limitN ?? undefined);
        log.push({ table, op, payload, ids: hit.map(r => r.id) });
        if (op === 'delete') { tables[table] = (tables[table] ?? []).filter(r => !hit.includes(r)); return resolve({ error: null, count: hit.length }); }
        return resolve({ data: hit, error: null });
      },
    };
    return q;
  }
  return { log, client: { from: query, rpc: async (name, args) => { log.push({ rpc: name, args }); return rpc ? rpc(name, args) : { error: null }; } } };
}
const userCtx = (client, userId = ME) => ({
  getUserContext: async () => ({ supabase: client, userId, admin: () => ({ admin: true }) }),
  requestError: () => Response.json({ error: 'x' }, { status: 401 }),
});
function chapterRoute(db, userId = ME) {
  return load('src/app/api/authoring/chapters/[chapterId]/route.ts', {
    'next/server': next, '@/lib/mobile/request-context': userCtx(db.client, userId),
    '@/lib/authoring/exclusivity-agreement': { hasAcceptedExclusivityPolicy: async () => true, EXCLUSIVITY_AGREEMENT_ERROR: 'e', EXCLUSIVITY_AGREEMENT_ID: 'chinh-sach-doc-quyen' },
    '@/lib/quests/reward-engine': { RewardEngine: { incrementTaskProgress: async () => ({ ok: true }) } },
    '@/lib/authoring/chapter-limits': limits,
  });
}
const params = (chapterId) => ({ params: Promise.resolve({ chapterId }) });
function library() {
  return {
    books: [{ id: BOOK, author_id: ME, deleted_at: null, is_exclusive: false }],
    chapters: [
      { id: CH(1), book_id: BOOK, published: false, removed_at: null, is_last_chapter: false },
      { id: CH(2), book_id: BOOK, published: true, removed_at: null, is_last_chapter: false },
      { id: CH(3), book_id: BOOK, published: false, removed_at: 't', is_last_chapter: false },
      { id: CH(4), book_id: BOOK, published: false, removed_at: null, is_last_chapter: true },
      { id: CH(5), book_id: BOOK, published: false, removed_at: null, is_last_chapter: false },
    ],
    purchase_transactions: [{ id: 'p1', chapter_id: CH(5) }],
  };
}

test('chapter PATCH rejects content over 200,000 characters (no limit before)', async () => {
  const db = fakeDb(library());
  const route = chapterRoute(db);
  const res = await route.PATCH(new Request('https://api.test/x', { method: 'PATCH', body: JSON.stringify({ content: 'a'.repeat(200_001) }) }), params(CH(1)));
  assert.equal(res.status, 413);
  assert.ok(!db.log.some(l => l.op === 'update'), 'nothing written');
});

test('chapter DELETE: only an unsold, non-last draft that is not removed, by the book owner', async () => {
  const db = fakeDb(library());
  const route = chapterRoute(db);
  const del = (id) => route.DELETE(new Request('https://api.test/x', { method: 'DELETE' }), params(id));
  assert.equal((await del(CH(2))).status, 409); // published
  assert.equal((await del(CH(3))).status, 403); // removed by an admin
  assert.equal((await del(CH(4))).status, 409); // last chapter
  assert.equal((await del(CH(5))).status, 409); // already bought
  assert.equal(db.log.filter(l => l.op === 'delete').length, 0);
  const stranger = chapterRoute(fakeDb(library()), OTHER);
  assert.equal((await stranger.DELETE(new Request('https://api.test/x', { method: 'DELETE' }), params(CH(1)))).status, 404);
  const ok = await del(CH(1));
  assert.equal(ok.status, 200);
  assert.deepEqual(db.log.filter(l => l.op === 'delete').map(l => l.ids), [[CH(1)]]);
});

test('reorder route: calls the RPC with the list and maps its errors to Vietnamese', async () => {
  let reply = { error: null };
  const db = fakeDb({}, { rpc: () => reply });
  const route = load('src/app/api/authoring/books/[bookId]/chapters/order/route.ts', { 'next/server': next, '@/lib/mobile/request-context': userCtx(db.client) });
  const put = (body, bookId = BOOK) => route.PUT(new Request('https://api.test/x', { method: 'PUT', body: JSON.stringify(body) }), { params: Promise.resolve({ bookId }) });
  assert.equal((await put({ chapterIds: [CH(2), CH(1)] })).status, 200);
  assert.deepEqual(db.log[0], { rpc: 'reorder_book_chapters', args: { p_book_id: BOOK, p_chapter_ids: [CH(2), CH(1)] } });
  assert.equal((await put({ chapterIds: ['x'] })).status, 400);
  assert.equal((await put({ chapterIds: [CH(1)] }, 'nope')).status, 404);
  reply = { error: { message: 'Chapter list must contain every chapter of the book exactly once' } };
  const stale = await put({ chapterIds: [CH(1)] });
  assert.equal(stale.status, 409); assert.match((await stale.json()).error, /tải lại/);
  reply = { error: { message: 'The last chapter must stay last' } };
  assert.equal((await put({ chapterIds: [CH(1)] })).status, 400);
  reply = { error: { message: 'Book x not found or not owned by caller' } };
  assert.equal((await put({ chapterIds: [CH(1)] })).status, 404);
});

function dispatch(file, handlers) {
  const calls = [];
  const h = (name) => async (req, c) => { calls.push({ name, method: req.method, body: req.body ? await req.json() : null, auth: req.headers.get('authorization'), params: await c?.params }); return Response.json({ ok: true }); };
  const imports = { '@/lib/mobile/response': response, '@/lib/mobile/forward': forward,
    '@/lib/mobile/request-context': { getUserContext: async () => { throw Error('not in POST'); }, requestError: () => null },
    '@/lib/authoring/workspace': {} };
  for (const [mod, names] of Object.entries(handlers)) imports[mod] = Object.fromEntries(names.map(([exp, name]) => [exp, h(name)]));
  return { route: load(file, imports), calls };
}
const send = (route, body, ctx) => route.POST(new Request('https://api.test/x', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify(body) }), ctx);

test('book dispatcher: each action reaches its web handler with only its own fields', async () => {
  const { route, calls } = dispatch('src/app/api/mobile/authoring/books/[bookId]/route.ts', {
    '@/app/api/authoring/books/[bookId]/route': [['PATCH', 'update'], ['DELETE', 'delete']],
    '@/app/api/authoring/books/[bookId]/chapters/route': [['POST', 'add']],
    '@/app/api/authoring/books/[bookId]/chapters/order/route': [['PUT', 'reorder']],
  });
  const ctx = { params: Promise.resolve({ bookId: BOOK }) };
  await send(route, { action: 'update', title: 'T', is_exclusive: false, author_id: OTHER, published: true }, ctx);
  await send(route, { action: 'delete' }, ctx);
  await send(route, { action: 'add-chapters', chapters: [{ title: 'C', content: '' }], book_id: 'x' }, ctx);
  await send(route, { action: 'reorder', chapterIds: [CH(1)] }, ctx);
  assert.deepEqual(calls.map(c => [c.name, c.method, c.body, c.auth, c.params.bookId]), [
    ['update', 'PATCH', { title: 'T', is_exclusive: false }, 'Bearer t', BOOK],
    ['delete', 'DELETE', null, 'Bearer t', BOOK],
    ['add', 'POST', { chapters: [{ title: 'C', content: '' }] }, 'Bearer t', BOOK],
    ['reorder', 'PUT', { chapterIds: [CH(1)] }, 'Bearer t', BOOK],
  ]);
  assert.equal((await send(route, { action: '__proto__' }, ctx)).status, 400);
  const guest = await route.POST(new Request('https://api.test/x', { method: 'POST', body: '{"action":"delete"}' }), ctx);
  assert.equal(guest.status, 401); assert.equal(calls.length, 4);
});

test('chapter + create dispatchers drop fields the app may not set (audio, moderation, owner)', async () => {
  const chapter = dispatch('src/app/api/mobile/authoring/chapters/[chapterId]/route.ts', {
    '@/app/api/authoring/chapters/[chapterId]/route': [['PATCH', 'save'], ['DELETE', 'delete']],
  });
  await send(chapter.route, { action: 'save', title: 'T', content: 'x', published: true, price: 5, is_last_chapter: true, audio_url: 'u', removed_at: null, book_id: 'b' }, params(CH(1)));
  assert.deepEqual(chapter.calls[0].body, { title: 'T', content: 'x', published: true, price: 5, is_last_chapter: true });
  const books = dispatch('src/app/api/mobile/authoring/books/route.ts', { '@/app/api/authoring/books/route': [['POST', 'create']] });
  await send(books.route, { action: 'create', title: 'T', isExclusive: false, chapterContent: 'x', published: false, audioUrl: 'u', author_id: OTHER });
  assert.deepEqual(books.calls[0].body, { title: 'T', isExclusive: false, chapterContent: 'x', published: false });
  assert.equal((await send(books.route, { title: 'no action' })).status, 400);
});

test('workspace: another author\'s published book is not editable; drafts only flag sold chapters', async () => {
  const workspace = load('src/lib/authoring/workspace.ts', {
    '@/lib/covers/resolve-book-cover': { resolveBookCoverUrl: async () => null },
    '@/lib/authoring/exclusivity-lock': { isExclusivityLocked: () => false },
    '@/lib/audio/get-chapter-audio': { getChapterAudio: async () => [] },
  });
  const tables = library();
  tables.books[0] = { ...tables.books[0], title: 'B', tags: [], published: true };
  tables.chapters = tables.chapters.map((c, i) => ({ ...c, title: `C${i}`, order_index: i + 1, price: 0 }));
  tables.characters = [];
  assert.equal(await workspace.getAuthorBook(fakeDb(tables).client, OTHER, BOOK), null);
  assert.equal(await workspace.getAuthorChapter(fakeDb(tables).client, OTHER, CH(1)), null);
  const mine = await workspace.getAuthorBook(fakeDb(tables).client, ME, BOOK);
  assert.deepEqual(mine.chapters.map(c => [c.id, c.removed, c.sold]), [[CH(1), false, false], [CH(2), false, false], [CH(3), true, false], [CH(4), false, false], [CH(5), false, true]]);
});

test('app helpers: the last chapter never moves; tags are trimmed, unique, at most 20', () => {
  const svc = load('mobile-vinh/src/services/authoring.ts', { 'expo-file-system': { File: class {}, Paths: {} }, './api': { mobileApi: async () => ({}) } });
  const rows = [{ id: 'a', isLastChapter: false }, { id: 'b', isLastChapter: false }, { id: 'z', isLastChapter: true }];
  assert.deepEqual(svc.moveChapter(rows, 0, 1).map(r => r.id), ['b', 'a', 'z']);
  assert.equal(svc.moveChapter(rows, 1, 1), null);
  assert.equal(svc.moveChapter(rows, 2, -1), null);
  assert.equal(svc.moveChapter(rows, 0, -1), null);
  assert.deepEqual(svc.parseTags(' a, b ,a,, c'), ['a', 'b', 'c']);
  assert.equal(svc.parseTags(Array.from({ length: 30 }, (_, i) => `t${i}`).join(',')).length, 20);
  assert.equal(svc.MAX_CONTENT, limits.MAX_CHAPTER_CONTENT_LENGTH);
});

test('agreement prompt: only a 403 with missingAgreementIds opens Cam kết', () => {
  const alerts = [];
  const api = load('mobile-vinh/src/services/api.ts', { './supabase': { requireSupabase: () => ({}) } });
  const prompt = load('mobile-vinh/src/services/agreement-prompt.ts', {
    'react-native': { Alert: { alert: (...a) => alerts.push(a) } }, 'expo-router': { router: { push: (to) => alerts.push(['push', to]) } }, './api': api,
  });
  assert.equal(prompt.promptMissingAgreement(new Error('x')), false);
  assert.equal(prompt.promptMissingAgreement(new api.ApiError('x', 404, { missingAgreementIds: ['a'] })), false);
  assert.equal(prompt.promptMissingAgreement(new api.ApiError('Cần xác nhận', 403, { missingAgreementIds: ['chinh-sach-doc-quyen'] })), true);
  alerts[0][2][1].onPress();
  assert.deepEqual(alerts[1], ['push', { pathname: '/cam-ket', params: { id: 'chinh-sach-doc-quyen' } }]);
});
