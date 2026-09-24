/* global __dirname */
const { readFileSync } = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');
test('mobile API preserves multipart boundaries, JSON behavior and account checks', async () => {
  const code = ts.transpileModule(readFileSync(path.resolve(__dirname, '../src/services/api.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  let user = 'alice';
  const requests = [];
  const api = {};
  const client = { auth: { getSession: async () => ({ data: { session: { user: { id: user }, access_token: 'test' } }, error: null }) } };
  new Function('require', 'exports', 'process', 'fetch', code)(() => ({ requireSupabase: () => client }), api,
    { env: { EXPO_PUBLIC_API_URL: 'https://local' } }, async (_url, options) => { requests.push(options); return Response.json({ ok: true }); });
  const form = new FormData(); form.append('file', new Blob(['test']), 'sample.png');
  await api.mobileApi('services/id/samples', 'alice', form);
  assert.equal(requests[0].body, form);
  assert.equal(requests[0].headers['Content-Type'], undefined);
  assert.equal(requests[0].headers.Authorization, 'Bearer test');
  await api.mobileApi('services/id', 'alice', { name: 'example' });
  assert.equal(requests[1].headers['Content-Type'], 'application/json');
  assert.equal(requests[1].body, '{"name":"example"}');
  user = 'bob';
  await assert.rejects(() => api.mobileApi('services/id/samples', 'alice', form));
  assert.equal(requests.length, 2);
});
