/* global __dirname */
// Order viewing (Phase 4a) with fake clients: no real orders or payments.
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
const response = load('src/lib/mobile/response.ts');
const ME = '00000000-0000-0000-0000-00000000000a';
const OTHER = '00000000-0000-0000-0000-00000000000b';
const ORDER = '00000000-0000-0000-0000-0000000000d1';

function fakeClient({ orders = [], order = null } = {}) {
  const log = { or: [], tables: [] };
  const client = { from(table) {
    log.tables.push(table);
    const q = {
      select() { return q; }, eq() { return q; }, in() { return q; }, order() { return q; },
      or(filter) { log.or.push(filter); return q; },
      maybeSingle() { return Promise.resolve({ data: table === 'orders' ? order : table === 'service_listings' ? { name: 'Vẽ bìa', service_type: 'illustration' } : null, error: null }); },
      then(resolve) {
        if (table === 'author_public_profiles') return resolve({ data: [{ id: OTHER, nickname: 'Hoạ sĩ B', username: 'b' }] });
        return resolve({ data: orders, error: null });
      },
    };
    return q;
  } };
  return { client, log };
}
const service = (extra = {}) => load('src/lib/orders/order-service.ts', { '@/lib/orders/config': { ORDER_EARNING_HOLD_DAYS: 4 }, ...extra });

test('listing orders rejects filter injection before querying', async () => {
  const { listOrdersForUser } = service();
  for (const bad of [`${OTHER}),or(id.neq.00000000-0000-0000-0000-000000000000`, 'x', `${OTHER},buyer_id.neq.${ME}`]) {
    const db = fakeClient();
    const result = await listOrdersForUser(db.client, ME, bad);
    assert.equal(result.ok, false); assert.equal(result.status, 400);
    assert.equal(db.log.or.length, 0, bad);
  }
  const bad = fakeClient();
  assert.equal((await listOrdersForUser(bad.client, 'not-a-uuid')).ok, false);
  assert.equal(bad.log.or.length, 0);
});
test('listing orders builds the exact two-party or all-mine filter', async () => {
  const { listOrdersForUser } = service();
  const pair = fakeClient({ orders: [{ id: 'o1' }] });
  assert.deepEqual(await listOrdersForUser(pair.client, ME, OTHER), { ok: true, orders: [{ id: 'o1' }] });
  assert.deepEqual(pair.log.or, [`and(buyer_id.eq.${ME},seller_id.eq.${OTHER}),and(buyer_id.eq.${OTHER},seller_id.eq.${ME})`]);
  const mine = fakeClient();
  await listOrdersForUser(mine.client, ME, null);
  assert.deepEqual(mine.log.or, [`buyer_id.eq.${ME},seller_id.eq.${ME}`]);
});
test('web GET /api/orders still requires withUserId and now rejects injected values', async () => {
  const db = fakeClient({ orders: [] });
  const route = load('src/app/api/orders/route.ts', {
    'next/server': next, '@/lib/supabase/server': {}, '@/lib/wallet/session': {},
    '@/lib/mobile/request-context': { getRequestContext: async () => ({ client: db.client, userId: ME }), requestError: () => Response.json({}, { status: 401 }) },
    '@/lib/orders/order-service': service(),
  });
  const get = (q) => route.GET(new Request(`https://api.test/api/orders${q}`));
  assert.equal((await get('')).status, 400);
  assert.equal((await get(`?withUserId=${encodeURIComponent(OTHER + '),or(id.neq.0')}`)).status, 400);
  assert.equal(db.log.or.length, 0);
  assert.equal((await get(`?withUserId=${OTHER}`)).status, 200);
});

test('mobile order list adds role and counterpart; works without withUserId', async () => {
  const db = fakeClient({ orders: [{ id: 'o1', buyer_id: ME, seller_id: OTHER }, { id: 'o2', buyer_id: OTHER, seller_id: ME }] });
  const route = load('src/app/api/mobile/orders/route.ts', {
    '@/lib/mobile/request-context': { getRequestContext: async () => ({ client: db.client, userId: ME }), requestError: () => Response.json({}, { status: 401 }) },
    '@/lib/mobile/response': response, '@/lib/mobile/orders': load('src/lib/mobile/orders.ts'), '@/lib/orders/order-service': service(),
  });
  const res = await route.GET(new Request('https://api.test/api/mobile/orders', { headers: { Authorization: 'Bearer t' } }));
  const { orders } = await res.json();
  assert.deepEqual(orders.map(o => [o.id, o.role, o.counterpart.nickname]), [['o1', 'buyer', 'Hoạ sĩ B'], ['o2', 'seller', 'Hoạ sĩ B']]);
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  const bad = await route.GET(new Request('https://api.test/api/mobile/orders?withUserId=x', { headers: { Authorization: 'Bearer t' } }));
  assert.equal(bad.status, 400);
});
test('mobile order detail: only parties see it, with listing and counterpart', async () => {
  const mk = (order) => {
    const db = fakeClient({ order });
    return load('src/app/api/mobile/orders/[orderId]/route.ts', {
      '@/lib/mobile/request-context': { getRequestContext: async () => ({ client: db.client, userId: ME }), requestError: () => Response.json({}, { status: 401 }) },
      '@/lib/mobile/response': response, '@/lib/mobile/orders': load('src/lib/mobile/orders.ts'), '@/lib/orders/order-service': service(),
    });
  };
  const get = (route, id = ORDER) => route.GET(new Request('https://api.test/x', { headers: { Authorization: 'Bearer t' } }), { params: Promise.resolve({ orderId: id }) });
  const mine = await (await get(mk({ id: ORDER, buyer_id: OTHER, seller_id: ME, listing_id: 'l' }))).json();
  assert.equal(mine.order.role, 'seller'); assert.equal(mine.order.counterpart.id, OTHER);
  assert.deepEqual(mine.order.service_listings, { name: 'Vẽ bìa', service_type: 'illustration' });
  assert.equal((await get(mk({ id: ORDER, buyer_id: OTHER, seller_id: '00000000-0000-0000-0000-00000000000c', listing_id: 'l' }))).status, 404);
  assert.equal((await get(mk(null), 'not-a-uuid')).status, 404);
});

test('deposit route explains the new server-side amount limits', async () => {
  for (const [message, expected] of [
    ['Deposit must be at least 330', 'Tiền cọc tối thiểu là 330 token.'],
    ['Payment exceeds order price (remaining 670)', 'Số tiền vượt giá đơn — chỉ còn 670 token cần thanh toán.'],
    ['Insufficient balance for user x', 'Số dư token không đủ.'],
  ]) {
    const route = load('src/app/api/orders/[orderId]/deposit/route.ts', {
      'next/server': next, '@/lib/supabase/server': { createServiceRoleClient: () => ({}) }, '@/lib/wallet/session': { getAuthedUserId: async () => ME },
      '@/lib/orders/order-service': { OrderService: { recordPayment: async () => { throw new Error(message); } } },
    });
    const res = await route.POST(new Request('https://api.test/x', { method: 'POST', body: JSON.stringify({ amount: 1 }) }), { params: Promise.resolve({ orderId: ORDER }) });
    assert.equal(res.status, 400); assert.equal((await res.json()).error, expected);
  }
});

test('app: amounts due match the web card; labels fall back safely', () => {
  const orders = load('mobile-vinh/src/services/orders.ts', { './api': {} });
  const base = { role: 'buyer', price: 1000, paid: 0, deposit_pct: 33 };
  assert.deepEqual(orders.paymentDue({ ...base, status: 'brief_confirmed' }), { label: 'Tiền cọc', amount: 330 });
  assert.deepEqual(orders.paymentDue({ ...base, status: 'in_progress', paid: 330 }), { label: 'Phần còn lại', amount: 670 });
  assert.equal(orders.paymentDue({ ...base, status: 'in_progress', paid: 1000 }), null);
  assert.equal(orders.paymentDue({ ...base, status: 'brief_confirmed', role: 'seller' }), null);
  assert.equal(orders.paymentDue({ ...base, status: 'delivered', paid: 330 }), null);
  assert.equal(orders.depositAmount({ price: 5, deposit_pct: 50 }), 3);
  assert.equal(orders.eventLabel('draft_submitted'), 'Gửi bản nháp'); assert.equal(orders.eventLabel('something_new'), 'Cập nhật đơn hàng');
  assert.equal(orders.partyName({ counterpart: { nickname: null, username: 'b' } }), '@b');
});
