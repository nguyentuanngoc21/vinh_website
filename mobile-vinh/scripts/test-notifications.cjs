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
      for (const name of ['select', 'update', 'eq', 'is', 'order', 'limit', 'abortSignal']) q[name] = (...args) => { calls.push([name, ...args]); return q; };
      q.maybeSingle = async () => result;
      q.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
      return q;
    },
  };
  const code = ts.transpileModule(readFileSync(path.join(__dirname, '../src/services/notifications.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const api = {};
  new Function('require', 'exports', code)(() => ({ requireSupabase: () => client }), api);
  return { api, calls };
}
test('notification read and update reject guest and other account before database access', async () => {
  for (const user of [null, 'bob']) {
    const f = setup({ user });
    await assert.rejects(f.api.getNotifications('alice'));
    await assert.rejects(f.api.markNotificationRead('alice', 'note'));
    assert.equal(f.calls.length, 0);
  }
});
test('mark read only updates one unread notification owned by the current account', async () => {
  const row = { id: 'note', read_at: '2026-09-23T00:00:00Z' };
  const f = setup({ result: { data: row, error: null } });
  assert.deepEqual(await f.api.markNotificationRead('alice', 'note'), row);
  for (const filter of [['eq', 'user_id', 'alice'], ['eq', 'id', 'note'], ['is', 'read_at', null]]) {
    assert.ok(f.calls.some(call => JSON.stringify(call) === JSON.stringify(filter)));
  }
  const update = f.calls.find(call => call[0] === 'update')[1];
  assert.deepEqual(Object.keys(update), ['read_at']);
  assert.ok(Number.isFinite(Date.parse(update.read_at)));
});
test('failed update and empty result do not fabricate a successful read timestamp', async () => {
  const f = setup({ result: { data: null, error: { message: 'offline' } } });
  await assert.rejects(f.api.markNotificationRead('alice', 'note'), /Chưa đánh dấu/);
  await assert.rejects(f.api.getNotifications('alice'), /Không tải/);
  assert.equal(await setup({ result: { data: null, error: null } }).api.markNotificationRead('alice', 'note'), null);
});
test('late response after account switch is rejected', async () => {
  await assert.rejects(setup({ switchUser: true }).api.getNotifications('alice'), /Phiên đăng nhập/);
  await assert.rejects(setup({ switchUser: true }).api.markNotificationRead('alice', 'note'), /Phiên đăng nhập/);
});
