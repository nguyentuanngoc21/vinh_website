/* global __dirname */
// Older-message cursor and realtime subscriptions (Phase 5b) with fake clients.
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
const ME = '00000000-0000-0000-0000-00000000000a';
const OTHER = '00000000-0000-0000-0000-00000000000b';

function threadRoute(rowCount) {
  const log = { lt: [], limit: [] };
  const rows = Array.from({ length: rowCount }, (_, i) => ({ id: `m${i}`, sender_id: OTHER, body: 'x', created_at: `2026-09-24T07:00:0${i}.123456+00:00`, flagged_off_platform: false }));
  const client = { from(table) {
    const q = {
      select() { return q; }, eq() { return q; }, or() { return q; }, is() { return q; }, in() { return q; }, order() { return q; },
      update() { return q; }, lt(k, v) { log.lt.push([k, v]); return q; },
      limit(n) { log.limit.push(n); return Promise.resolve({ data: rows.slice(0, n), error: null }); },
      maybeSingle: async () => ({ data: { id: OTHER, nickname: 'B', username: 'b', avatar_url: null }, error: null }),
      then(resolve) { return resolve({ error: null }); },
    };
    return q;
  } };
  const route = load('src/app/api/messages/[userId]/route.ts', {
    'next/server': { NextResponse: { json: (b, i) => Response.json(b, i) } },
    '@/lib/mobile/request-context': { getRequestContext: async () => ({ client, userId: ME }), requestError: () => Response.json({}, { status: 401 }) },
    '@/lib/orders/off-platform-detector': { isLikelyOffPlatform: () => false },
  });
  const get = (query) => route.GET(new Request(`https://api.test/api/messages/${OTHER}${query}`), { params: Promise.resolve({ userId: OTHER }) });
  return { get, log };
}

test('thread without a cursor behaves as before: newest 200, no older filter', async () => {
  const f = threadRoute(3);
  const body = await (await f.get('?context=personal')).json();
  assert.deepEqual(f.log.lt, []); assert.deepEqual(f.log.limit, [200]);
  assert.equal(body.hasMore, false); assert.equal(body.messages.length, 3);
});
test('older page: strictly before the cursor, limited, reports whether more exist', async () => {
  const cursor = '2026-09-24T07:00:00.123456+00:00';
  const f = threadRoute(10);
  const body = await (await f.get(`?context=personal&before=${encodeURIComponent(cursor)}&limit=5`)).json();
  assert.deepEqual(f.log.lt, [['created_at', cursor]]); assert.deepEqual(f.log.limit, [5]);
  assert.equal(body.hasMore, true); assert.equal(body.messages.length, 5);
  const capped = threadRoute(1);
  await capped.get(`?before=${encodeURIComponent('2026-09-24T07:00:00Z')}&limit=9999`);
  assert.deepEqual(capped.log.limit, [200]);
});
test('malformed cursors are rejected before any query', async () => {
  for (const bad of ["2026-09-24'),or(id.neq.x", 'yesterday', '2026-09-24']) {
    const f = threadRoute(1);
    assert.equal((await f.get(`?before=${encodeURIComponent(bad)}`)).status, 400, bad);
    assert.deepEqual(f.log.limit, []);
  }
});

test('realtime subscribes only to the signed-in user\'s rows and cleans up', () => {
  const channels = [];
  const removed = [];
  const client = {
    channel(name) {
      const ch = { name, listeners: [], on(type, opts, cb) { ch.listeners.push({ type, ...opts, cb }); return ch; }, subscribe() { ch.subscribed = true; return ch; } };
      channels.push(ch); return ch;
    },
    removeChannel: async (ch) => { removed.push(ch.name); },
  };
  const realtime = load('mobile-vinh/src/services/realtime.ts', { './supabase': { requireSupabase: () => client } });
  const got = [];
  const stopMessages = realtime.subscribeMessages(ME, row => got.push(row.id));
  const stopNotifications = realtime.subscribeNotifications(ME, row => got.push(row.id));
  assert.deepEqual(channels[0].listeners.map(l => [l.event, l.table, l.filter]), [
    ['INSERT', 'direct_messages', `recipient_id=eq.${ME}`], ['INSERT', 'direct_messages', `sender_id=eq.${ME}`]]);
  assert.deepEqual(channels[1].listeners.map(l => [l.event, l.table, l.filter]), [['INSERT', 'notifications', `user_id=eq.${ME}`]]);
  assert.ok(channels.every(c => c.subscribed)); assert.notEqual(channels[0].name, channels[1].name);
  channels[0].listeners[0].cb({ new: { id: 'm1' } }); channels[1].listeners[0].cb({ new: { id: 'n1' } });
  assert.deepEqual(got, ['m1', 'n1']);
  stopMessages(); stopNotifications();
  assert.deepEqual(removed, channels.map(c => c.name));
});
test('incoming rows are matched to the open thread by counterpart and mailbox', () => {
  const { belongsToThread } = load('mobile-vinh/src/services/realtime.ts', { './supabase': {} });
  const row = (over) => ({ sender_id: OTHER, recipient_id: ME, context: 'personal', ...over });
  assert.equal(belongsToThread(row({}), ME, OTHER, 'personal'), true);
  assert.equal(belongsToThread(row({ sender_id: ME, recipient_id: OTHER }), ME, OTHER, 'personal'), true);
  assert.equal(belongsToThread(row({ context: 'moderation' }), ME, OTHER, 'personal'), false);
  assert.equal(belongsToThread(row({ sender_id: '00000000-0000-0000-0000-00000000000c' }), ME, OTHER, 'personal'), false);
});
