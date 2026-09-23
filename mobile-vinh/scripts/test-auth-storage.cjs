/* global __dirname */
const { readFileSync } = require('node:fs');
const { Buffer } = require('node:buffer');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');
function load(file, imports = {}) {
  const code = ts.transpileModule(readFileSync(path.join(__dirname, '../src/services', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => imports[name], exports);
  return exports;
}
const { createChunkedStorage } = load('chunkedStorage.ts');
function storageFixture() {
  const items = new Map(); let failure = null;
  const raw = {
    async getItem(key) { return items.get(key) ?? null; },
    async setItem(key, value) {
      if (failure?.(key)) throw Error('Device write failed');
      assert.ok(Buffer.byteLength(value, 'utf8') < 2048);
      items.set(key, value);
    },
    async removeItem(key) { items.delete(key); },
  };
  return { items, storage: createChunkedStorage(raw), fail: value => { failure = value; } };
}
test('long Unicode session survives save, replacement and sign-out', async () => {
  const { items, storage } = storageFixture();
  const value = 'Vịnh🙂'.repeat(1500);
  await storage.setItem('session', value);
  assert.equal(await storage.getItem('session'), value);
  await storage.setItem('session', 'short');
  assert.equal(await storage.getItem('session'), 'short');
  assert.equal(items.size, 2);
  await storage.removeItem('session'); assert.equal(items.size, 0);
});
test('partial write failure retains the old session and removes new chunks', async () => {
  const f = storageFixture();
  await f.storage.setItem('session', 'old');
  f.fail(key => key.endsWith('.1'));
  await assert.rejects(f.storage.setItem('session', 'new'.repeat(1000)));
  assert.equal(await f.storage.getItem('session'), 'old'); assert.equal(f.items.size, 2);
});
test('legacy values migrate and concurrent operations preserve ordering', async () => {
  const f = storageFixture(); f.items.set('session', 'legacy');
  assert.equal(await f.storage.getItem('session'), 'legacy');
  await Promise.all([f.storage.setItem('session', 'first'), f.storage.setItem('session', 'last')]);
  assert.equal(await f.storage.getItem('session'), 'last'); assert.equal(f.items.has('session'), false);
});
test('missing chunk fails closed instead of returning a partial token', async () => {
  const f = storageFixture(); await f.storage.setItem('session', 'x'.repeat(1000));
  f.items.delete([...f.items.keys()].find(key => key.endsWith('.1')));
  await assert.rejects(f.storage.getItem('session'));
});
test('OTP login never creates a new account and verifies email code', async () => {
  const calls = [];
  const api = load('auth.ts', { './supabase': { requireSupabase: () => ({ auth: {
    signInWithOtp: async args => { calls.push(args); return { error: null }; },
    verifyOtp: async args => { calls.push(args); return { error: null }; },
  } }) } });
  await api.sendLoginCode(' Test@Example.com ');
  assert.deepEqual(calls[0], { email: 'test@example.com', options: { shouldCreateUser: false } });
  await api.verifyLoginCode('test@example.com', '123456');
  assert.equal(calls[1].type, 'email');
  await assert.rejects(api.verifyLoginCode('test@example.com', '123'));
  await assert.rejects(api.sendLoginCode('bad-email'));
  assert.equal(calls.length, 2);
});
test('password login uses existing credentials and exposes a friendly error', async () => {
  let input;
  const api = load('auth.ts', { './supabase': { requireSupabase: () => ({ auth: {
    signInWithPassword: async args => { input = args; return { error: { code: 'invalid_credentials' } }; },
  } }) } });
  await assert.rejects(api.loginWithPassword(' A@example.com ', 'secret'), /Email hoặc mật khẩu không đúng/);
  assert.deepEqual(input, { email: 'a@example.com', password: 'secret' });
});
