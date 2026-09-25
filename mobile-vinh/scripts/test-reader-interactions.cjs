/* global __dirname */
// Reading interactions (Phase 6a) with fake clients: no real comments, votes or rewards.
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
const next = { NextResponse: { json: (b, i) => Response.json(b, i) } };
const ME = '00000000-0000-0000-0000-00000000000a';
const AUTHOR = '00000000-0000-0000-0000-00000000000b';
const CHAPTER = '00000000-0000-0000-0000-0000000000c1';
const BOOK = '00000000-0000-0000-0000-0000000000b1';

function db({ chapter = { id: CHAPTER, book_id: BOOK, price: 0, content: 'A\n\nB' }, book = { id: BOOK, author_id: AUTHOR }, purchase = null } = {}) {
  const writes = [];
  const client = { from(table) {
    const q = {
      select() { return q; }, eq() { return q; }, is() { return q; }, order() { return q; }, in() { return q; },
      insert(row) { writes.push([table, row]); return { select: () => ({ single: async () => ({ data: { id: 'new', ...row }, error: null }) }), then: (r) => r({ error: null }) }; },
      delete() { writes.push([table, 'delete']); return q; },
      maybeSingle: async () => ({ data: table === 'chapters' ? chapter : table === 'books' ? book : table === 'purchase_transactions' ? purchase : null, error: null }),
      then(resolve) { return resolve({ data: [], error: null }); },
    };
    return q;
  } };
  return { client, writes };
}
const access = () => load('src/lib/reading/chapter-access.ts');

test('chapter access: published only; paid chapters need the author or a purchase', async () => {
  const { checkChapterAccess } = access();
  assert.equal((await checkChapterAccess(db().client, ME, CHAPTER)).ok, true);
  assert.equal((await checkChapterAccess(db({ chapter: null }).client, ME, CHAPTER)).status, 404);
  assert.equal((await checkChapterAccess(db({ book: null }).client, ME, CHAPTER)).status, 404);
  const paid = { id: CHAPTER, book_id: BOOK, price: 30, content: 'A' };
  assert.equal((await checkChapterAccess(db({ chapter: paid }).client, ME, CHAPTER)).status, 403);
  assert.equal((await checkChapterAccess(db({ chapter: paid, purchase: { id: 'p' } }).client, ME, CHAPTER)).ok, true);
  assert.equal((await checkChapterAccess(db({ chapter: paid }).client, AUTHOR, CHAPTER)).ok, true);
  assert.equal((await checkChapterAccess(db().client, ME, CHAPTER, '00000000-0000-0000-0000-0000000000b2')).status, 404);
});

const ctx = (client) => ({ getRequestContext: async () => ({ client, userId: ME }), requestError: () => Response.json({}, { status: 401 }) });
const params = { params: Promise.resolve({ chapterId: CHAPTER }) };
const post = (route, body = {}) => route.POST(new Request('https://api.test/x', { method: 'POST', body: JSON.stringify(body) }), params);
test('comments, highlights, votes and trope votes refuse chapters the user cannot read', async () => {
  const paid = { id: CHAPTER, book_id: BOOK, price: 30, content: 'A' };
  const reward = { RewardEngine: { incrementTaskProgress: async () => ({ ok: true }) } };
  for (const [file, body] of [
    ['src/app/api/chapters/[chapterId]/comments/route.ts', { content: 'Hay', paragraphIndex: 0 }],
    ['src/app/api/chapters/[chapterId]/highlights/route.ts', { paragraphIndex: 0, charStart: 0, charEnd: 1 }],
    ['src/app/api/chapters/[chapterId]/vote/route.ts', {}],
    ['src/app/api/chapters/[chapterId]/trope-vote/route.ts', { characterId: 'c1' }],
  ]) {
    for (const [chapter, status] of [[paid, 403], [null, 404]]) {
      const f = db({ chapter });
      const route = load(file, { 'next/server': next, '@/lib/mobile/request-context': ctx(f.client), '@/lib/reading/chapter-access': access(), '@/lib/quests/reward-engine': reward });
      const res = await post(route, body);
      assert.equal(res.status, status, `${file} ${status}`);
      assert.deepEqual(f.writes, [], `${file} wrote despite ${status}`);
    }
  }
});

test('mobile interactions dispatcher forwards each action with only its fields', async () => {
  const calls = [];
  const h = (name) => async (req, c) => { calls.push({ name, method: req.method, body: req.body ? await req.json() : null, params: await c.params }); return Response.json({ ok: true }); };
  const route = load('src/app/api/mobile/chapters/[chapterId]/interactions/route.ts', {
    '@/app/api/chapters/[chapterId]/comments/route': { GET: h('comments'), POST: h('comment') },
    '@/app/api/chapters/[chapterId]/comments/[commentId]/route': { DELETE: h('delete-comment') },
    '@/app/api/chapters/[chapterId]/highlights/route': { GET: h('highlights'), POST: h('highlight') },
    '@/app/api/chapters/[chapterId]/highlights/[highlightId]/route': { DELETE: h('remove-highlight') },
    '@/app/api/chapters/[chapterId]/vote/route': { POST: h('vote') },
    '@/app/api/chapters/[chapterId]/trope-vote/route': { POST: h('trope') },
    '@/app/api/books/[bookId]/share/route': { POST: h('share') },
    '@/app/api/authors/[authorId]/follow/route': { POST: h('follow') },
    '@/lib/mobile/request-context': ctx({}), '@/lib/mobile/response': load('src/lib/mobile/response.ts'),
    '@/lib/reading/chapter-interactions': { getChapterInteractions: async () => ({}) },
  });
  const send = (body, token = 't') => route.POST(new Request('https://api.test/x', { method: 'POST', headers: token ? { Authorization: 'Bearer ' + token } : {}, body: JSON.stringify(body) }), params);
  await send({ action: 'comment', content: 'Hay', paragraphIndex: 2, parentCommentId: null, userId: 'spoof' });
  await send({ action: 'delete-comment', commentId: 'k1' });
  await send({ action: 'highlight', paragraphIndex: 1, charStart: 0, charEnd: 5, color: 'red' });
  await send({ action: 'trope-vote', characterId: 'c1' });
  await send({ action: 'share', bookId: BOOK });
  await send({ action: 'follow-author', authorId: AUTHOR });
  assert.deepEqual(calls.map(c => [c.name, c.method, c.body]), [
    ['comment', 'POST', { content: 'Hay', paragraphIndex: 2, parentCommentId: null }], ['delete-comment', 'DELETE', null],
    ['highlight', 'POST', { paragraphIndex: 1, charStart: 0, charEnd: 5 }], ['trope', 'POST', { characterId: 'c1' }],
    ['share', 'POST', null], ['follow', 'POST', null]]);
  assert.equal(calls[1].params.commentId, 'k1'); assert.equal(calls[4].params.bookId, BOOK); assert.equal(calls[5].params.authorId, AUTHOR);
  assert.equal((await send({ action: 'penalty' })).status, 400);
  assert.equal((await send({ action: 'vote' }, null)).status, 401);
  assert.equal(calls.length, 6);
});

test('app: comment threads, highlight runs and trope labels match the web', () => {
  const reading = load('mobile-vinh/src/services/reading.ts', { 'react-native': { Share: {} }, './api': {} });
  const c = (id, p, parent = null) => ({ id, paragraphIndex: p, parentCommentId: parent });
  const { byParagraph, counts } = reading.groupComments([c('a', 0), c('b', 0, 'a'), c('d', 2), c('e', 0)]);
  assert.equal(counts.get(0), 3); assert.equal(counts.get(2), 1);
  assert.deepEqual(byParagraph.get(0).map(t => [t.top.id, t.replies.map(r => r.id)]), [['a', ['b']], ['e', []]]);
  assert.deepEqual(reading.highlightSegments('abcdefgh', [{ charStart: 2, charEnd: 4 }, { charStart: 3, charEnd: 6 }]),
    [{ text: 'ab', marked: false }, { text: 'cdef', marked: true }, { text: 'gh', marked: false }]);
  assert.deepEqual(reading.highlightSegments('abc', [{ charStart: 0, charEnd: 99 }]), [{ text: 'abc', marked: true }]);
  assert.equal(reading.tropeLabel({ name: 'Lan', role: 'villain', trope: null }), 'Lan (Phản diện)');
  assert.equal(reading.tropeLabel({ name: 'Lan', role: 'hero', trope: 'Kẻ phản bội' }), 'Lan — Kẻ phản bội');
});
test('app: sharing counts toward the quest only when the share sheet reports a share', async () => {
  for (const [action, expected] of [['sharedAction', true], ['dismissedAction', false]]) {
    const recorded = [];
    const reading = load('mobile-vinh/src/services/reading.ts', {
      'react-native': { Share: { sharedAction: 'sharedAction', dismissedAction: 'dismissedAction', share: async () => ({ action }) } },
      './api': { mobileApi: async (p, u, body) => { recorded.push(body); return {}; } },
    });
    assert.equal(await reading.shareAndRecord(ME, CHAPTER, BOOK, 'x'), expected);
    assert.deepEqual(recorded, expected ? [{ action: 'share', bookId: BOOK }] : []);
  }
});
