/* global __dirname */
// Kết nối, listings, auto samples, following and ordering (Phase 5a/5c) with fake clients.
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
const SELLER = '00000000-0000-0000-0000-00000000000s';
const BUYER = '00000000-0000-0000-0000-00000000000b';
const LISTING = '00000000-0000-0000-0000-0000000000a1';

/** Minimal query builder: records filters per table and answers from `rows[table]`. */
function fakeDb(rows = {}) {
  const log = [];
  const client = {
    storage: { from: (bucket) => ({ getPublicUrl: (p) => ({ data: { publicUrl: `https://cdn/${bucket}/${p}` } }) }) },
    from(table) {
      const call = { table, filters: [], inserted: null, deleted: false }; log.push(call);
      const result = () => {
        const data = typeof rows[table] === 'function' ? rows[table](call) : rows[table];
        return { data: data ?? null, error: null, count: Array.isArray(data) ? data.length : 0 };
      };
      const q = {
        select() { return q; }, order() { return q; }, limit() { return q; },
        eq(k, v) { call.filters.push(['eq', k, v]); return q; }, is(k, v) { call.filters.push(['is', k, v]); return q; },
        in(k, v) { call.filters.push(['in', k, v]); return q; },
        insert(v) { call.inserted = v; return Promise.resolve({ error: null }); },
        delete() { call.deleted = true; return q; },
        maybeSingle: async () => { const r = result(); return { ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data }; },
        then(resolve) { return resolve(result()); },
      };
      return q;
    },
  };
  return { client, log };
}
const service = () => load('src/lib/orders/service-listing-service.ts');
const ctx = (client, userId) => ({ getRequestContext: async () => ({ client, userId }), requestError: () => Response.json({}, { status: 401 }) });

test('samples route: owner sees everything, others only public listings that accept orders', async () => {
  const cases = [
    [{ seller_id: SELLER, is_accepting_orders: false, is_private: true }, SELLER, 200],
    [{ seller_id: SELLER, is_accepting_orders: true, is_private: false }, BUYER, 200],
    [{ seller_id: SELLER, is_accepting_orders: true, is_private: false }, null, 200],
    [{ seller_id: SELLER, is_accepting_orders: true, is_private: true }, BUYER, 404],
    [{ seller_id: SELLER, is_accepting_orders: false, is_private: false }, null, 404],
    [null, BUYER, 404],
  ];
  for (const [listing, viewer, status] of cases) {
    const db = fakeDb({ service_listings: listing, service_samples: [{ id: 's1', file_url: 'a.png' }] });
    const route = load('src/app/api/profile/services/[listingId]/samples/route.ts', { 'next/server': next, '@/lib/mobile/request-context': ctx(db.client, viewer) });
    const res = await route.GET(new Request('https://api.test/x'), { params: Promise.resolve({ listingId: LISTING }) });
    assert.equal(res.status, status, JSON.stringify([listing, viewer]));
    assert.equal(db.log.some(c => c.table === 'service_samples'), status === 200);
  }
});

test('auto samples follow Bộ quy tắc Commission Điều 2.1: newest public works, own-name books only', async () => {
  const { fetchAutoSamples } = service();
  const db = fakeDb({
    public_design_items: [{ id: 'd1', title: 'Bìa', image_url: 'x/d1.png' }],
    public_audio_narrations: [{ id: 'a1', title: 'Chương 1', audio_url: 'x/a1.mp3' }],
    books: [{ id: 'b1', title: 'Truyện tự viết' }],
  });
  assert.deepEqual(await fetchAutoSamples(db.client, { sellerId: SELLER, serviceType: 'illustration' }),
    [{ kind: 'image', title: 'Bìa', ref: 'd1', url: 'https://cdn/design-images/x/d1.png' }]);
  assert.deepEqual(await fetchAutoSamples(db.client, { sellerId: SELLER, serviceType: 'voice' }),
    [{ kind: 'audio', title: 'Chương 1', ref: 'a1', url: 'https://cdn/audio-narrations/x/a1.mp3' }]);
  assert.deepEqual(await fetchAutoSamples(db.client, { sellerId: SELLER, serviceType: 'ghostwriting' }),
    [{ kind: 'book', title: 'Truyện tự viết', ref: 'b1', url: null }]);
  const books = db.log.find(c => c.table === 'books').filters;
  for (const f of [['eq', 'author_id', SELLER], ['eq', 'is_ghostwritten', false], ['eq', 'published', true], ['is', 'deleted_at', null]])
    assert.ok(books.some(x => JSON.stringify(x) === JSON.stringify(f)), JSON.stringify(f));
  assert.ok(!db.log.some(c => c.table === 'orders'), 'must not read completed orders');
});

test('listing samples: uploaded ones win; otherwise auto; external links are marked unverified', async () => {
  const lib = load('src/lib/orders/public-listing.ts', { '@/lib/orders/service-listing-service': service() });
  const withUploads = fakeDb({ service_samples: [{ id: 'u1', source: 'upload', file_url: 's/u1.mp3', unverified_external: false },
    { id: 'e1', source: 'external', file_url: 'https://portfolio.example', unverified_external: false }] });
  const listing = { id: LISTING, seller_id: SELLER, service_type: 'voice' };
  assert.deepEqual((await lib.listingSamples(withUploads.client, listing)).map(s => [s.id, s.kind, s.url, s.unverified]), [
    ['u1', 'audio', 'https://cdn/audio-narrations/s/u1.mp3', false], ['e1', 'link', 'https://portfolio.example', true]]);
  assert.ok(!withUploads.log.some(c => c.table === 'public_audio_narrations'));
  const empty = fakeDb({ service_samples: [], public_audio_narrations: [{ id: 'a1', title: 'Bản thu', audio_url: 'a.mp3' }] });
  assert.deepEqual((await lib.listingSamples(empty.client, listing)).map(s => [s.id, s.source, s.kind]), [['a1', 'auto', 'audio']]);
});

test('listing detail: viewable while accepting orders (or by the seller); tiers keep their original index', async () => {
  const lib = load('src/lib/orders/public-listing.ts', { '@/lib/orders/service-listing-service': service() });
  const base = { id: LISTING, seller_id: SELLER, service_type: 'illustration', name: 'Vẽ bìa', price_tiers: [{ label: 'Nháp', price: 0 }, { label: 'Đầy đủ', price: 500 }],
    is_accepting_orders: true, is_private: true, is_accepting_commissions: true, monthly_commission_limit: 2, lost_contact_days: 7 };
  const db = fakeDb({ service_listings: base, author_public_profiles: { id: SELLER, nickname: 'Hoạ sĩ' }, orders: [{ id: 'o1' }], service_samples: [], public_design_items: [] });
  const view = await lib.getListingForViewer(db.client, LISTING, BUYER);
  assert.deepEqual(view.priceTiers, [{ index: 1, label: 'Đầy đủ', price: 500 }]);
  assert.equal(view.commissionStatus, 'available'); assert.equal(view.isOwn, false); assert.equal(view.seller.nickname, 'Hoạ sĩ');
  const closed = fakeDb({ service_listings: { ...base, is_accepting_orders: false } });
  assert.equal(await lib.getListingForViewer(closed.client, LISTING, BUYER), null);
  const own = fakeDb({ service_listings: { ...base, is_accepting_orders: false }, author_public_profiles: null, orders: [], service_samples: [], public_design_items: [] });
  assert.equal((await lib.getListingForViewer(own.client, LISTING, SELLER)).isOwn, true);
});

test('ordering from mobile uses the same checks: tier price from the listing, no self-orders', async () => {
  const created = [];
  const mk = (listing, buyer = BUYER) => load('src/app/api/orders/route.ts', {
    'next/server': next, '@/lib/mobile/request-context': ctx(fakeDb({ service_listings: listing }).client, buyer),
    '@/lib/orders/order-service': { listOrdersForUser: async () => ({ ok: true, orders: [] }),
      OrderService: { createOrder: async (_c, p) => { created.push(p); return { id: 'o1' }; } } },
  });
  const listing = { id: LISTING, seller_id: SELLER, is_accepting_orders: true, price_tiers: [{ price: 100 }, { price: 250 }], deposit_pct: 30, revisions_max: 1 };
  const post = (route, body) => route.POST(new Request('https://api.test/x', { method: 'POST', body: JSON.stringify(body) }));
  assert.equal((await post(mk(listing), { listingId: LISTING, priceTierIndex: 1, price: 1 })).status, 200);
  assert.equal(created[0].price, 250); assert.equal(created[0].buyerId, BUYER); assert.equal(created[0].depositPct, 30);
  assert.equal((await post(mk(listing, SELLER), { listingId: LISTING })).status, 400);
  assert.equal((await post(mk({ ...listing, is_accepting_orders: false }), { listingId: LISTING })).status, 400);
  assert.equal((await post(mk(listing), { listingId: LISTING, priceTierIndex: 5 })).status, 400);
  assert.equal(created.length, 1);
});

test('follow toggles for the caller and refuses self-follow', async () => {
  let existing = null;
  const db = fakeDb({ author_follows: () => existing });
  const route = load('src/app/api/authors/[authorId]/follow/route.ts', {
    'next/server': next, '@/lib/mobile/request-context': ctx(db.client, BUYER),
    '@/lib/quests/reward-engine': { RewardEngine: { incrementTaskProgress: async () => ({ ok: true }) } },
  });
  const post = (authorId) => route.POST(new Request('https://api.test/x', { method: 'POST' }), { params: Promise.resolve({ authorId }) });
  assert.deepEqual(await (await post(SELLER)).json(), { following: true });
  assert.deepEqual(db.log.find(c => c.inserted).inserted, { follower_id: BUYER, author_id: SELLER });
  existing = { author_id: SELLER };
  assert.deepEqual(await (await post(SELLER)).json(), { following: false });
  assert.equal((await post(BUYER)).status, 400);
});

test('app: directory filters and labels match the web', () => {
  const connect = load('mobile-vinh/src/services/connect.ts', { './api': {} });
  const person = (over) => ({ id: 'p', nickname: 'Ngọc', username: 'ngoc', creatorTags: [], works: { truyen: [], audio: [], design: [] }, ...over });
  assert.deepEqual(connect.tagsOf(person({})), ['Đọc giả']);
  assert.deepEqual(connect.tagsOf(person({ creatorTags: ['blogger'], works: { truyen: [{}], audio: [], design: [{}] } })), ['Blogger', 'Tác giả', 'Họa sĩ']);
  const people = [person({ id: 'a', nickname: 'An', username: 'an', works: { truyen: [{}], audio: [], design: [] } }), person({ id: 'b', nickname: 'Bình', username: 'binh' })];
  assert.deepEqual(connect.filterPeople(people, 'Tác giả', '').map(p => p.id), ['a']);
  assert.deepEqual(connect.filterPeople(people, 'Tất cả', 'BIN').map(p => p.id), ['b']);
  assert.equal(connect.commissionLabel({ commissionStatus: 'off', activeCommissionCount: 0, monthlyCommissionLimit: null }), '');
  assert.equal(connect.commissionLabel({ commissionStatus: 'busy', activeCommissionCount: 3, monthlyCommissionLimit: 3 }), 'Đang bận — đang xử lý 3/3 comm');
});
