/* global __dirname */
const { readFileSync } = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');
function setup({ userId = 'alice', missing = false } = {}) {
  const writes = [];
  const client = { from: () => ({ upsert: async value => { writes.push(value); return { error: null }; } }) };
  const imports = {
    'next/server': { NextResponse: Response },
    '@/lib/mobile/request-context': { getRequestContext: async () => ({ client, userId }), requestError: () => Response.json({}, { status: 401 }) },
    '@/lib/legal/registry': { getAgreement: id => ({ id, name: 'Terms', updatedAt: 'v2' }) },
    '@/lib/legal/contract-parties': { AGREEMENT_PARTY_INFO: missing ? { terms: { author: [{ key: 'name', label: 'Họ tên' }] } } : {} },
    '@/lib/legal/contract-info-service': { resolveAuthorContractInfo: async () => ({ name: null }) },
  };
  const file = path.resolve(__dirname, '../../src/app/api/profile/agreements/[agreementId]/accept/route.ts');
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const api = {};
  new Function('require', 'exports', code)(name => imports[name], api);
  const call = (version, mobile = true) => api.POST(new Request('https://local', { method: 'POST', headers: mobile ? { Authorization: 'Bearer token' } : {}, body: JSON.stringify({ version, user_id: 'attacker' }) }), { params: Promise.resolve({ agreementId: 'terms' }) });
  return { call, writes };
}
test('mobile cannot confirm an unseen or outdated version', async () => {
  for (const version of [undefined, 'v1']) { const f = setup(); assert.equal((await f.call(version)).status, 409); assert.equal(f.writes.length, 0); }
});
test('acceptance binds authenticated user and server version', async () => {
  const f = setup(); assert.equal((await f.call('v2')).status, 200);
  assert.equal(f.writes[0].user_id, 'alice'); assert.equal(f.writes[0].accepted_version, 'v2');
});
test('missing contract fields and guest identity never write acceptance', async () => {
  for (const options of [{ missing: true }, { userId: null }]) {
    const f = setup(options); assert.ok((await f.call('v2')).status >= 400); assert.equal(f.writes.length, 0);
  }
});
test('existing cookie-based web acceptance remains compatible', async () => {
  const f = setup(); assert.equal((await f.call(undefined, false)).status, 200);
});
