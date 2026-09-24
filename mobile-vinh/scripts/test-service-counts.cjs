/* global __dirname */
const { readFileSync } = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');

function load(file, imports = {}) {
  const code = ts.transpileModule(readFileSync(path.resolve(__dirname, '../../', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const api = {};
  new Function('require', 'exports', code)(name => imports[name] ?? {}, api);
  return api;
}
const { computeCommissionStatus } = load('src/lib/orders/service-listing-service.ts');
const { mobileResponse } = load('src/lib/mobile/response.ts');

function setup({ listings = [], failed = false, denied = false } = {}) {
  const filters = [];
  const client = { from: table => {
    let listingId;
    const q = {
      select: (_columns, options) => {
        if (table === 'orders') assert.deepEqual(options, { count: 'exact', head: true });
        return q;
      },
      eq: (key, value) => { filters.push([table, key, value]); if (key === 'listing_id') listingId = value; return q; },
      order: async () => ({ data: listings, error: null }),
      then: resolve => resolve({ count: failed ? null : listingId === 'first' ? 2 : 0, error: failed ? { message: 'unavailable' } : null }),
    };
    return q;
  } };
  const api = load('src/app/api/mobile/services/route.ts', {
    '@/lib/mobile/response': { mobileResponse },
    '@/lib/mobile/request-context': {
      getRequestContext: async () => { if (denied) throw new Error('invalid token'); return { client, userId: 'owner' }; },
      requestError: () => Response.json({}, { status: 401 }),
    },
    '@/lib/orders/service-listing-service': { computeCommissionStatus, computeMissingFields: () => [] },
  });
  return { filters, call: () => api.GET(new Request('https://local', { headers: { authorization: 'Bearer test' } })) };
}

test('service counts use only owned listings and in-progress orders, with separate counts per package', async () => {
  const f = setup({ listings: ['first', 'second'].map(id => ({ id, is_accepting_commissions: true, monthly_commission_limit: 2 })) });
  const response = await f.call();
  assert.equal(response.status, 200);
  const { listings } = await response.json();
  assert.deepEqual(listings.map(row => [row.activeCommissionCount, row.commissionStatus]), [[2, 'busy'], [0, 'available']]);
  assert.deepEqual(f.filters, [
    ['service_listings', 'seller_id', 'owner'],
    ['orders', 'listing_id', 'first'], ['orders', 'status', 'in_progress'],
    ['orders', 'listing_id', 'second'], ['orders', 'status', 'in_progress'],
  ]);
});

test('failed counts remain unknown instead of showing zero availability', async () => {
  const f = setup({ failed: true, listings: [{ id: 'first', is_accepting_commissions: true, monthly_commission_limit: 2 }] });
  const { listings } = await (await f.call()).json();
  assert.equal(listings[0].activeCommissionCount, null);
  assert.equal(listings[0].commissionStatus, null);
});

test('invalid authentication never queries service counts', async () => {
  const f = setup({ denied: true });
  assert.equal((await f.call()).status, 401);
  assert.deepEqual(f.filters, []);
});

test('commission status respects disabled, missing limit and threshold cases', () => {
  assert.equal(computeCommissionStatus(false, 2, 0), 'off');
  assert.equal(computeCommissionStatus(true, null, 0), 'off');
  assert.equal(computeCommissionStatus(true, 2, 1), 'available');
  assert.equal(computeCommissionStatus(true, 2, 2), 'busy');
  assert.equal(computeCommissionStatus(true, 2, 3), 'busy');
});
