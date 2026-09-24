/* global __dirname */
const { readFileSync } = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');
function setup({ owned = true, missing = false, agreed = true, listing = {} } = {}) {
  const updates = []; const filters = [];
  const current = { id: 'listing', is_accepting_orders: true, is_accepting_commissions: false, ...listing };
  const client = { from: () => {
    const q = { select: () => q, eq: (key, value) => { filters.push([key, value]); return q; },
      maybeSingle: async () => ({ data: owned ? current : null, error: null }),
      update: value => { updates.push(value); return q; }, single: async () => ({ data: { ...current, ...updates[0] }, error: null }) };
    return q;
  } };
  const imports = {
    'next/server': { NextResponse: Response }, '@/lib/supabase/server': {}, '@/lib/wallet/session': {},
    '@/lib/mobile/request-context': { getRequestContext: async () => ({ client, userId: 'alice' }), requestError: () => Response.json({}, { status: 401 }) },
    '@/lib/orders/service-listing-service': { computeMissingFields: () => missing ? [{ key: 'name', label: 'Tên' }] : [] },
    '@/lib/orders/commission-agreement': { hasAcceptedCommissionRules: async () => agreed, COMMISSION_AGREEMENT_ERROR: 'Cần đồng ý', COMMISSION_AGREEMENT_ID: 'rules' },
  };
  const source = readFileSync(path.resolve(__dirname, '../../src/app/api/profile/services/[listingId]/route.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const api = {}; new Function('require', 'exports', code)(name => imports[name], api);
  return { updates, filters, call: value => api.PATCH(new Request('https://local', { method: 'PATCH', body: JSON.stringify(typeof value === 'boolean' ? { isAcceptingOrders: value } : value) }), { params: Promise.resolve({ listingId: 'listing' }) }) };
}

test('commission enabling requires a limit and is independent of order eligibility', async () => {
  const absent = setup();
  assert.equal((await absent.call({ isAcceptingCommissions: true })).status, 400);
  assert.equal(absent.updates.length, 0);
  const f = setup({ missing: true, agreed: false, listing: { is_accepting_orders: false, monthly_commission_limit: 3 } });
  assert.equal((await f.call({ isAcceptingCommissions: true })).status, 200);
  assert.equal(f.updates[0].is_accepting_commissions, true);
  assert.equal(f.updates[0].is_accepting_orders, false);
});

test('commission owner checks, stopping and clearing an active limit', async () => {
  const other = setup({ owned: false });
  assert.equal((await other.call({ isAcceptingCommissions: true })).status, 404);
  assert.equal(other.updates.length, 0);
  const active = setup({ listing: { is_accepting_commissions: true, monthly_commission_limit: 2 } });
  assert.equal((await active.call({ monthly_commission_limit: null })).status, 400);
  assert.equal(active.updates.length, 0);
  assert.equal((await active.call({ isAcceptingCommissions: false, monthly_commission_limit: null })).status, 200);
  assert.equal(active.updates[0].is_accepting_commissions, false);
  assert.equal(active.updates[0].is_accepting_orders, true);
});

test('commission limit accepts null or positive database integers only', () => {
  const validate = editValidator();
  for (const limit of [null, 1, 2147483647]) assert.deepEqual(validate({ monthly_commission_limit: limit }), { monthly_commission_limit: limit });
  for (const limit of [0, -1, 1.5, '3', Infinity, 2147483648]) assert.throws(() => validate({ monthly_commission_limit: limit }));
});
test('non-owner cannot change service availability', async () => {
  const f = setup({ owned: false }); assert.equal((await f.call(true)).status, 404);
  assert.deepEqual(f.filters, [['id', 'listing'], ['seller_id', 'alice']]); assert.equal(f.updates.length, 0);
});
test('missing fields or commission agreement block enabling', async () => {
  for (const [options, status] of [[{ missing: true }, 400], [{ agreed: false }, 403]]) {
    const f = setup(options); assert.equal((await f.call(true)).status, status); assert.equal(f.updates.length, 0);
  }
});
test('owner can stop receiving orders even if the agreement or fields are missing', async () => {
  const f = setup({ missing: true, agreed: false }); assert.equal((await f.call(false)).status, 200);
  assert.equal(f.updates[0].is_accepting_orders, false);
});
test('eligible owner can enable receiving orders', async () => {
  const f = setup(); assert.equal((await f.call(true)).status, 200); assert.equal(f.updates[0].is_accepting_orders, true);
});
function editValidator() {
  const source = readFileSync(path.resolve(__dirname, '../../src/lib/mobile/service-edit.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const api = {}; new Function('exports', code)(api); return api.serviceEdit;
}
test('mobile edit rejects invalid money, percentages and text', () => {
  const validate = editValidator();
  for (const input of [{ deposit_pct: 101 }, { delivery_days: -1 }, { revisions_max: 0.5 },
    { lost_contact_days: null }, { name: 3 }, { price_tiers: [{ label: 'Gói', price: 0 }] },
    { price_tiers: [{ label: '', price: 100 }] }, { price_tiers: [{ label: 'Gói', price: Infinity }] }]) {
    assert.throws(() => validate(input));
  }
});
test('mobile edit preserves allowed values and never forwards ownership or status changes', () => {
  const validate = editValidator();
  assert.deepEqual(validate({ name: ' Gói A ', deposit_pct: 0, revisions_max: 0, delivery_days: null,
    seller_id: 'other', is_accepting_orders: true,
    price_tiers: [{ label: ' Cơ bản ', price: 100 }] }), {
    name: 'Gói A', deposit_pct: 0, delivery_days: null, revisions_max: 0, price_tiers: [{ label: 'Cơ bản', price: 100 }],
  });
  assert.throws(() => validate({ seller_id: 'other' }));
});
test('refund policy requires four finite percentages and preserves zero', () => {
  const validate = editValidator();
  const policy = { before_draft: 100, draft_pending: 50.5, draft_approved: 10, delivered: 0 };
  assert.deepEqual(validate({ refund_policy: policy }), { refund_policy: policy });
  assert.deepEqual(validate({ refund_policy: null }), { refund_policy: null });
  for (const invalid of [{}, { ...policy, delivered: -1 }, { ...policy, delivered: 101 }, { ...policy, delivered: NaN }, { ...policy, delivered: '0' }, []]) {
    assert.throws(() => validate({ refund_policy: invalid }));
  }
});
test('usage rights and private setting accept only supported choices', () => {
  const validate = editValidator();
  assert.deepEqual(validate({ default_usage_scope: 'commercial_full', is_private: false }), { default_usage_scope: 'commercial_full', is_private: false });
  assert.throws(() => validate({ default_usage_scope: 'anything' }));
  assert.throws(() => validate({ is_private: 'true' }));
});
