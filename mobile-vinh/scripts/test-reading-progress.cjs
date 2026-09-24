/* global __dirname */
// Execute the real route and service with a fake database: no production writes.
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
const BOOK = '00000000-0000-0000-0000-00000000000b';
const OTHER_BOOK = '00000000-0000-0000-0000-00000000000c';
const CHAPTER = '00000000-0000-0000-0000-0000000000c1';
function setup({ price = 0, purchased = false, author = 'author', chapterBook = BOOK, upsertError = false, tokenError = false } = {}) {
  const upserts = []; const events = []; const tables = [];
  const client = {
    from(table) {
      tables.push(table);
      const query = {
        select() { return query; }, eq() { return query; }, is() { return query; },
        upsert(value, options) { upserts.push({ value, options }); return Promise.resolve({ error: upsertError ? 'fail' : null }); },
        maybeSingle() {
          if (table === 'chapters') return Promise.resolve({ data: { id: CHAPTER, book_id: chapterBook, price, content: 'Một\n\nHai\n\nBa' }, error: null });
          if (table === 'books') return Promise.resolve({ data: { id: BOOK, author_id: author }, error: null });
          if (table === 'purchase_transactions') return Promise.resolve({ data: purchased ? { id: 'p' } : null, error: null });
          throw Error('Unexpected table ' + table);
        },
      };
      return query;
    },
  };
  const service = load('src/lib/reading/record-progress.ts', {
    '@/lib/quests/reading-event-service': { ReadingEventService: { recordChapterCompletion: async (_c, p) => { events.push(p); } } },
  });
  const route = load('src/app/api/mobile/books/[bookId]/reading-progress/route.ts', {
    '@/lib/mobile/request-context': {
      getRequestContext: async () => { if (tokenError) throw new Error('Unauthorized'); return { client, userId: 'reader' }; },
      requestError: () => Response.json({ error: 'Vui lòng đăng nhập lại.' }, { status: 401 }),
    },
    '@/lib/mobile/response': load('src/lib/mobile/response.ts'),
    '@/lib/reading/record-progress': service,
  });
  const post = (body, { bookId = BOOK, token = 'valid' } = {}) => route.POST(new Request(`http://localhost/api/mobile/books/${bookId}/reading-progress`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ bookId }) });
  const webRoute = load('src/app/api/books/[bookId]/reading-progress/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/supabase/server': { createServiceRoleClient: () => client },
    '@/lib/wallet/session': { getAuthedUserId: async () => (tokenError ? null : 'reader') },
    '@/lib/reading/record-progress': service,
  });
  const postWeb = (body, bookId = BOOK) => webRoute.POST(new Request(`http://localhost/api/books/${bookId}/reading-progress`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ bookId }) });
  return { post, postWeb, upserts, events, tables };
}

test('free chapter saves position; completion is recorded only when flagged', async () => {
  const f = setup();
  let res = await f.post({ chapterId: CHAPTER, paragraphIndex: 1 });
  assert.equal(res.status, 200); assert.equal(res.headers.get('cache-control'), 'private, no-store');
  assert.equal(f.upserts.length, 1); assert.equal(f.events.length, 0);
  assert.equal(f.upserts[0].value.user_id, 'reader'); assert.equal(f.upserts[0].value.last_paragraph_index, 1);
  assert.equal(f.upserts[0].options.onConflict, 'user_id,book_id');
  res = await f.post({ chapterId: CHAPTER, paragraphIndex: 2, completed: true });
  assert.equal(res.status, 200);
  assert.deepEqual(f.events, [{ userId: 'reader', bookId: BOOK, chapterId: CHAPTER }]);
});
test('locked chapter without purchase writes nothing', async () => {
  const f = setup({ price: 20 });
  const res = await f.post({ chapterId: CHAPTER, paragraphIndex: 0, completed: true });
  assert.equal(res.status, 403); assert.equal(f.upserts.length, 0); assert.equal(f.events.length, 0);
});
test('buyer and author of a paid chapter can record progress', async () => {
  const buyer = setup({ price: 20, purchased: true });
  assert.equal((await buyer.post({ chapterId: CHAPTER, paragraphIndex: 2, completed: true })).status, 200);
  assert.equal(buyer.events.length, 1);
  const author = setup({ price: 20, author: 'reader' });
  assert.equal((await author.post({ chapterId: CHAPTER, paragraphIndex: 0 })).status, 200);
  assert.ok(!author.tables.includes('purchase_transactions'));
});
test('chapter from another book and out-of-range paragraph are rejected', async () => {
  const f = setup({ chapterBook: OTHER_BOOK });
  assert.equal((await f.post({ chapterId: CHAPTER, paragraphIndex: 0, completed: true })).status, 404);
  const g = setup();
  assert.equal((await g.post({ chapterId: CHAPTER, paragraphIndex: 3, completed: true })).status, 400);
  assert.equal(f.upserts.length + g.upserts.length, 0); assert.equal(f.events.length + g.events.length, 0);
});
test('malformed input, missing and invalid tokens are rejected before any read', async () => {
  const f = setup();
  for (const body of [{ chapterId: 'x', paragraphIndex: 0 }, { chapterId: CHAPTER, paragraphIndex: -1 },
    { chapterId: CHAPTER, paragraphIndex: 1.5 }, { chapterId: CHAPTER, paragraphIndex: 0, completed: 'yes' }])
    assert.equal((await f.post(body)).status, 400);
  assert.equal((await f.post({ chapterId: CHAPTER, paragraphIndex: 0 }, { bookId: 'not-a-uuid' })).status, 400);
  assert.equal((await f.post({ chapterId: CHAPTER, paragraphIndex: 0 }, { token: null })).status, 401);
  assert.equal(f.tables.length, 0);
  const g = setup({ tokenError: true });
  assert.equal((await g.post({ chapterId: CHAPTER, paragraphIndex: 0 })).status, 401);
});
test('failed position write does not trigger rewards', async () => {
  const f = setup({ upsertError: true });
  assert.equal((await f.post({ chapterId: CHAPTER, paragraphIndex: 2, completed: true })).status, 502);
  assert.equal(f.events.length, 0);
});
test('web route: locked chapter can no longer be claimed as read', async () => {
  const f = setup({ price: 20 });
  assert.equal((await f.postWeb({ chapterId: CHAPTER, paragraphIndex: 0, isLastParagraph: true })).status, 403);
  assert.equal(f.upserts.length, 0); assert.equal(f.events.length, 0);
});
test('web route: normal reading still saves and records completion', async () => {
  const f = setup();
  assert.equal((await f.postWeb({ chapterId: CHAPTER, paragraphIndex: 1 })).status, 200);
  assert.equal(f.events.length, 0);
  assert.equal((await f.postWeb({ chapterId: CHAPTER, paragraphIndex: 2, isLastParagraph: true })).status, 200);
  assert.deepEqual(f.events, [{ userId: 'reader', bookId: BOOK, chapterId: CHAPTER }]);
  assert.equal(f.upserts.length, 2);
});
test('web route: guests, wrong book and bad input are rejected', async () => {
  assert.equal((await setup({ tokenError: true }).postWeb({ chapterId: CHAPTER, paragraphIndex: 0 })).status, 401);
  const f = setup({ chapterBook: OTHER_BOOK });
  assert.equal((await f.postWeb({ chapterId: CHAPTER, paragraphIndex: 0, isLastParagraph: true })).status, 404);
  const g = setup();
  assert.equal((await g.postWeb({ chapterId: 'x', paragraphIndex: 0 })).status, 400);
  assert.equal((await g.postWeb({ chapterId: CHAPTER, paragraphIndex: 9, isLastParagraph: true })).status, 400);
  assert.equal(f.events.length + g.events.length + f.upserts.length + g.upserts.length, 0);
});
