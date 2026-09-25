/* global __dirname */
const { readFileSync } = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');
function compile(file, imports, extra = {}) {
  const code = ts.transpileModule(readFileSync(path.resolve(__dirname, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const api = {};
  new Function('require', 'exports', ...Object.keys(extra), code)(name => {
    if (!(name in imports)) throw Error('Unexpected import ' + name);
    return imports[name];
  }, api, ...Object.values(extra));
  return api;
}
function authSetup({ valid = true, serviceKey = 'mobile-secret' } = {}) {
  const clients = []; let cookies = 0;
  const api = compile('../../src/lib/mobile/request-context.ts', {
    '@supabase/supabase-js': { createClient: (url, key) => {
      clients.push({ url, key });
      return { auth: { getUser: async token => ({ data: { user: valid && token === 'real-token' ? { id: 'alice' } : null }, error: null }) } };
    } },
    '@/lib/supabase/server': { createServiceRoleClient: () => { cookies++; return {}; } },
    '@/lib/wallet/session': { getAuthedUserId: async () => 'web-user' },
  }, { process: { env: { MOBILE_SUPABASE_URL: 'https://mobile.example', MOBILE_SUPABASE_PUBLISHABLE_KEY: 'public',
    MOBILE_SUPABASE_SERVICE_ROLE_KEY: serviceKey, NEXT_PUBLIC_SUPABASE_URL: 'https://web.example', SUPABASE_SERVICE_ROLE_KEY: 'web-secret' } } });
  return { api, clients, cookies: () => cookies };
}
test('Bearer identity is verified before selecting the matching mobile database', async () => {
  const f = authSetup();
  const result = await f.api.getRequestContext(new Request('https://local/api', { headers: { Authorization: 'Bearer real-token' } }));
  assert.equal(result.userId, 'alice'); assert.equal(f.cookies(), 0);
  assert.deepEqual(f.clients, [{ url: 'https://mobile.example', key: 'public' }, { url: 'https://mobile.example', key: 'mobile-secret' }]);
});
test('invalid Bearer never falls back to cookies or creates privileged client', async () => {
  for (const header of ['Basic abc', 'Bearer fake', 'Bearer a b']) {
    const f = authSetup();
    await assert.rejects(f.api.getRequestContext(new Request('https://local', { headers: { Authorization: header } })), /Unauthorized/);
    assert.equal(f.cookies(), 0); assert.ok(!f.clients.some(c => c.key.includes('secret')));
  }
});
test('missing matching service key fails closed; cookie web login remains supported', async () => {
  const f = authSetup({ serviceKey: '' });
  await assert.rejects(f.api.getRequestContext(new Request('https://local', { headers: { Authorization: 'Bearer real-token' } })), /not configured/);
  assert.equal((await f.api.getRequestContext(new Request('https://local'))).userId, 'web-user');
});
test('mobile response requires a token and returns uncached CORS responses on failure', async () => {
  const api = compile('../../src/lib/mobile/response.ts', {});
  let called = false;
  const denied = await api.mobileResponse(new Request('https://local'), async () => { called = true; return Response.json({}); });
  assert.equal(denied.status, 401); assert.equal(called, false);
  const failure = await api.mobileResponse(new Request('https://local', { headers: { Authorization: 'Bearer token' } }), async () => { throw Error('secret'); });
  assert.equal(failure.status, 503); assert.match(failure.headers.get('cache-control'), /no-store/);
  assert.equal(failure.headers.get('access-control-allow-origin'), '*');
  assert.ok(!(await failure.text()).includes('secret'));
});
test('notification navigation accepts only the known local chat link', () => {
  const api = compile('../src/services/notification-link.ts', {});
  const id = '11111111-1111-1111-1111-111111111111';
  assert.deepEqual(api.notificationChat(`/ca-nhan?tab=chat&chat=${id}&context=moderation`), { chat: id, context: 'moderation' });
  for (const link of [null, 'https://evil.test/ca-nhan?tab=chat', '//evil.test', '/ca-nhan?tab=chat&chat=bad', '/ca-nhan?tab=wallet']) assert.equal(api.notificationChat(link), null);
});
const alice = '11111111-1111-1111-1111-111111111111';
const bob = '22222222-2222-2222-2222-222222222222';
function threadSetup() {
  const calls = [];
  const client = {
    from(table) {
      const call = { table, ops: [] }; calls.push(call);
      const q = {};
      for (const name of ['select', 'eq', 'is', 'in', 'or', 'order', 'limit', 'update', 'insert']) q[name] = (...args) => { call.ops.push([name, ...args]); return q; };
      function result() {
        if (table === 'author_public_profiles') return { data: { id: bob, nickname: 'Bob' }, error: null };
        if (table === 'profiles') return { data: { role: 'reader' }, error: null };
        if (call.ops.some(op => op[0] === 'insert')) return { data: { id: 'sent', created_at: '2026-09-23' }, error: null };
        if (call.ops.some(op => op[0] === 'update')) return { data: null, error: null };
        return { data: [{ id: 'new', sender_id: bob, body: 'New', flagged_off_platform: true }, { id: 'old', sender_id: alice, body: 'Old', flagged_off_platform: true }], error: null };
      }
      q.single = q.maybeSingle = async () => result();
      q.then = (resolve, reject) => Promise.resolve(result()).then(resolve, reject);
      return q;
    },
    rpc: async () => ({ error: null }),
  };
  const api = compile('../../src/app/api/messages/[userId]/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/mobile/request-context': { getRequestContext: async () => ({ client, userId: alice }), requestError: () => Response.json({}, { status: 401 }) },
    '@/lib/orders/off-platform-detector': { isLikelyOffPlatform: () => false },
  });
  return { api, calls };
}
test('thread selects newest messages, marks returned incoming IDs only, and hides other sender flags', async () => {
  const f = threadSetup();
  const response = await f.api.GET(new Request('https://local?context=moderation'), { params: Promise.resolve({ userId: bob }) });
  const data = await response.json();
  assert.deepEqual(data.messages.map(m => m.id), ['old', 'new']);
  assert.equal(data.messages[1].flagged, false);
  const reads = f.calls.find(c => c.table === 'direct_messages' && !c.ops.some(o => o[0] === 'update'));
  assert.ok(reads.ops.some(o => o[0] === 'order' && o[1] === 'created_at' && o[2].ascending === false));
  const write = f.calls.find(c => c.ops.some(o => o[0] === 'update'));
  for (const filter of [['eq', 'recipient_id', alice], ['eq', 'sender_id', bob], ['eq', 'context', 'moderation'], ['in', 'id', ['new', 'old']]]) {
    assert.ok(write.ops.some(o => JSON.stringify(o) === JSON.stringify(filter)));
  }
});
test('send rejects self, filter injection and oversized messages before insert', async () => {
  for (const [id, body, status] of [[alice, 'Hi', 400], ['bad,recipient_id.not.is.null', 'Hi', 400], [bob, 'x'.repeat(4001), 400]]) {
    const f = threadSetup();
    const response = await f.api.POST(new Request('https://local', { method: 'POST', body: JSON.stringify({ body }) }), { params: Promise.resolve({ userId: id }) });
    assert.equal(response.status, status);
    assert.ok(!f.calls.some(c => c.ops.some(o => o[0] === 'insert')));
  }
});
test('client cannot forge a moderation conversation or choose the sender', async () => {
  const f = threadSetup();
  const response = await f.api.POST(new Request('https://local', { method: 'POST', body: JSON.stringify({ body: 'Hi', context: 'moderation', sender_id: bob }) }), { params: Promise.resolve({ userId: bob }) });
  assert.equal(response.status, 200);
  const inserted = f.calls.flatMap(c => c.ops).find(o => o[0] === 'insert')[1];
  assert.equal(inserted.sender_id, alice); assert.equal(inserted.recipient_id, bob); assert.equal(inserted.context, 'personal');
});
