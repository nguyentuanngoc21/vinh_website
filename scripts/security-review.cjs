// Offline security reproductions. No .env loading, network, or real database.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const results = [];
function load(file, mocks = {}, env = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports, process: { env }, console: { error() {} },
    crypto: require('node:crypto').webcrypto, TextEncoder, TextDecoder, btoa, atob,
    require(name) {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      throw new Error(`Unmocked dependency blocked: ${name}`);
    },
  }, { filename: file });
  return exports;
}
const next = { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } };
(async () => {
  let payoutCalls = 0;
  const payout = load('src/app/api/wallet/withdraw/callback/route.ts', {
    'next/server': next,
    '@/lib/supabase/server': { createServiceRoleClient: () => ({}) },
    '@/lib/wallet/withdrawal-service': { WithdrawalService: { handlePayoutResult: async (_, input) => {
      payoutCalls++; return input;
    } } },
  });
  const response = await payout.POST(new Request('http://localhost/api/wallet/withdraw/callback', {
    method: 'POST', body: JSON.stringify({ requestId: '00000000-0000-4000-8000-000000000001', success: false }),
  }));
  assert.equal(response.status, 200);
  assert.equal(payoutCalls, 1);
  results.push('CONFIRMED: unsigned, unauthenticated payout callback reaches payout service');

  let settlements = 0;
  const cronMocks = {
    'next/server': next,
    '@/lib/supabase/server': { createServiceRoleClient: () => ({}) },
    '@/lib/wallet/ledger-service': { LedgerService: { settleDuePendingTransactions: async () => { settlements++; return []; } } },
  };
  const cron = load('src/app/api/wallet/cron/settle-pending/route.ts', cronMocks);
  assert.equal((await cron.GET(new Request('http://localhost/api/wallet/cron/settle-pending'))).status, 200);
  assert.equal(settlements, 1);
  const protectedCron = load('src/app/api/wallet/cron/settle-pending/route.ts', cronMocks, { CRON_SECRET: 'test-only' });
  assert.equal((await protectedCron.GET(new Request('http://localhost/api/wallet/cron/settle-pending'))).status, 401);
  assert.equal(settlements, 1);
  results.push('CONFIRMED: missing cron secret fails open; configured secret rejects unauthenticated request');

  const deposit = load('src/lib/wallet/deposit-service.ts', {
    '@/lib/wallet/ledger-service': { LedgerService: {} },
    '@/lib/wallet/gateways/zalopay': { zalopayGatewayAdapter: {} },
  });
  assert.ok(deposit.stubGatewayAdapter.verifyAndParse(JSON.stringify({ gatewayOrderId: 'offline-test', status: 'success', amountVnd: 1000 }), new Headers()));
  results.push('CONFIRMED: stub deposit adapter accepts unsigned event (requires matching stub order for credit)');

  const session = load('src/lib/session.ts', {}, { SESSION_SECRET: 'isolated-test-secret-not-used-by-app' });
  const token = await session.encodeSession({ email: 'test@example.invalid', name: 'Test', handle: 'test', role: 'user' }, 60);
  assert.ok(await session.decodeSession(token));
  assert.equal(await session.decodeSession('X' + token.slice(1)), null);
  assert.equal(await session.decodeSession(await session.encodeSession({ handle: 'test' }, -1)), null);
  results.push('CONTROL PASS: tampered and expired session cookies rejected');
  let authChecks = 0;
  const identity = load('src/lib/wallet/session.ts', {
    'next/headers': { cookies: async () => ({ get: () => ({ value: token }) }) },
    '@/lib/session': session,
    '@/lib/supabase/server': { createClient: async () => { authChecks++; return { auth: { getUser: async () => ({ data: { user: null } }) } }; } },
  });
  const client = { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'offline-user' } }) }) }) }) };
  assert.equal(await identity.getAuthedUserId(client), 'offline-user');
  assert.equal(authChecks, 0);
  results.push('CONFIRMED: copied valid custom cookie bypasses Supabase session revocation check');
  console.log(results.join('\n'));
})().catch(error => { console.error(error); process.exitCode = 1; });
