/* global __dirname */
const { readFileSync } = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');
function setup({ user = 'alice', result = { data: [], error: null }, switchUser = false } = {}) {
  const calls = []; let checks = 0;
  const client = {
    auth: { getSession: async () => ({ data: { session: user ? { user: { id: switchUser && checks++ ? 'bob' : user } } : null } }) },
    from(table) {
      calls.push(['from', table]); const q = {};
      for (const name of ['select', 'eq', 'order', 'limit', 'abortSignal']) q[name] = (...args) => { calls.push([name, ...args]); return q; };
      q.maybeSingle = async () => result;
      q.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
      return q;
    },
  };
  const code = ts.transpileModule(readFileSync(path.join(__dirname, '../src/services/account.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const api = {};
  new Function('require', 'exports', code)(() => ({ requireSupabase: () => client }), api);
  return { api, calls };
}
test('guest or a different account cannot request private account data', async () => {
  for (const user of [null, 'bob']) {
    const f = setup({ user });
    await assert.rejects(f.api.getAccountProfile('alice'));
    await assert.rejects(f.api.getRecentTransactions('alice'));
    assert.equal(f.calls.length, 0);
  }
});
test('account switch during a request rejects the previous account response', async () => {
  const f = setup({ switchUser: true, result: { data: { token_balance: 10 }, error: null } });
  await assert.rejects(f.api.getAccountProfile('alice'), /Phiên đăng nhập/);
  await assert.rejects(setup({ switchUser: true }).api.getRecentTransactions('alice'), /Phiên đăng nhập/);
});
test('missing profiles and failed history requests never become zero balances or empty history', async () => {
  await assert.rejects(setup({ result: { data: null, error: null } }).api.getAccountProfile('alice'), /Không tìm thấy/);
  const f = setup({ result: { data: null, error: { message: 'denied' } } });
  await assert.rejects(f.api.getAccountProfile('alice'), /Không tải/);
  await assert.rejects(f.api.getRecentTransactions('alice'), /Không tải/);
});
test('history stays scoped to current account and preserves signed amounts and pending status', async () => {
  const entries = [{ id: 'debit', amount: -25, status: 'completed' }, { id: 'credit', amount: 8, status: 'pending' }];
  const f = setup({ result: { data: entries, error: null } });
  assert.deepEqual(await f.api.getRecentTransactions('alice'), entries);
  assert.ok(f.calls.some(c => c[0] === 'eq' && c[1] === 'user_id' && c[2] === 'alice'));
  assert.ok(f.calls.some(c => c[0] === 'limit' && c[1] === 20));
  assert.equal(f.api.transactionStatus('pending'), 'Chờ xử lý');
  assert.equal(f.api.transactionStatus('future-status'), 'Chưa xác định');
  assert.equal(f.api.transactionLabel('future-type'), 'Giao dịch khác');
});
