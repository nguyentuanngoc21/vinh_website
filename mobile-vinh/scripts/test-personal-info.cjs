/* global __dirname */
// Identity verification, bank details and contract dates with fake clients: no real CCCD or bank data.
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

function fakeDb({ previous = false } = {}) {
  const log = { uploads: [], deletes: [], inserts: [], updates: [] };
  const client = {
    storage: { from: (bucket) => ({ upload: async (p) => { log.uploads.push({ bucket, path: p }); return { error: null }; } }) },
    from(table) {
      const query = {
        select() { return query; }, eq() { return query; }, neq() { return query; }, order() { return query; }, limit() { return query; },
        maybeSingle() { return Promise.resolve({ data: table === 'identity_verifications' && previous ? { id: 'old' } : null }); },
        single() { return Promise.resolve({ data: { bank_code: 'VCB', bank_name: 'Vietcombank', bank_account_number: '0123456', bank_account_name: 'A' }, error: null }); },
        delete() { return { eq: (_k, id) => { log.deletes.push(id); return Promise.resolve({ error: null }); } }; },
        insert(row) { log.inserts.push({ table, row }); return Promise.resolve({ error: null }); },
        update(row) { log.updates.push({ table, row }); return { eq: () => Promise.resolve({ error: null }) }; },
      };
      return query;
    },
  };
  return { client, log };
}
const context = (client, userId = 'user-1') => ({
  getRequestContext: async () => ({ client, userId }), requestError: () => Response.json({ error: 'x' }, { status: 401 }),
});
const image = () => new File([new Uint8Array([1, 2, 3])], 'side.jpg', { type: 'image/jpeg' });
function identityForm(fields) {
  const f = new FormData();
  for (const [k, v] of Object.entries({ cccd: '012345678901', cccdFront: image(), cccdBack: image(), ...fields })) if (v !== undefined) f.append(k, v);
  return f;
}

test('identity: OCR-checked, stored privately, previous verification replaced, number masked', async () => {
  const db = fakeDb({ previous: true });
  let ocr = 0;
  const route = load('src/app/api/profile/identity/route.ts', {
    'next/server': next, '@/lib/mobile/request-context': context(db.client), '@/lib/ocr': { verifyCccdAgainstImages: async () => { ocr++; return true; } },
  });
  const res = await route.POST(new Request('https://api.test/x', { method: 'POST', body: identityForm({ cccdIssuedAt: '2021-05-02' }) }));
  const body = await res.json();
  assert.equal(res.status, 200); assert.equal(ocr, 1);
  assert.deepEqual(body, { ok: true, cccdVerified: true, cccdNumberMasked: '********8901', cccdIssuedAt: '2021-05-02' });
  assert.ok(db.log.uploads.every(u => u.bucket === 'identity-documents' && u.path.startsWith('user-1/')));
  assert.deepEqual(db.log.deletes, ['old']);
  assert.equal(db.log.inserts[0].row.status, 'approved');
  assert.deepEqual(db.log.updates[0].row, { cccd_last4: '8901', cccd_verified: true });
});
test('identity: invalid number, missing image and OCR mismatch store nothing', async () => {
  for (const [fields, match] of [[{ cccd: '123' }, true], [{ cccdBack: undefined }, true], [{}, false]]) {
    const db = fakeDb();
    const route = load('src/app/api/profile/identity/route.ts', {
      'next/server': next, '@/lib/mobile/request-context': context(db.client), '@/lib/ocr': { verifyCccdAgainstImages: async () => match },
    });
    const res = await route.POST(new Request('https://api.test/x', { method: 'POST', body: identityForm(fields) }));
    assert.equal(res.status, 400);
    assert.equal(db.log.uploads.length + db.log.inserts.length + db.log.updates.length, 0);
  }
});
test('mobile identity route passes the multipart body through and requires a token', async () => {
  const seen = [];
  const route = load('src/app/api/mobile/profile/identity/route.ts', {
    '@/app/api/profile/identity/route': {
      GET: async () => Response.json({ cccdVerified: false }),
      POST: async (req) => { const f = await req.formData(); seen.push([f.get('cccd'), f.get('cccdFront').size]); return Response.json({ ok: true }); },
    },
    '@/lib/mobile/response': response,
  });
  const res = await route.POST(new Request('https://api.test/api/mobile/profile/identity', {
    method: 'POST', headers: { Authorization: 'Bearer t' }, body: identityForm({}),
  }));
  assert.equal(res.status, 200); assert.deepEqual(seen, [['012345678901', 3]]);
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  const anonymous = await route.POST(new Request('https://api.test/x', { method: 'POST', body: identityForm({}) }));
  assert.equal(anonymous.status, 401); assert.equal(seen.length, 1);
});

test('bank: only listed banks and 6–19 digit numbers are saved', async () => {
  const banks = load('src/lib/banks.ts');
  for (const [body, status] of [
    [{ bankCode: 'XXX', bankAccountNumber: '0123456', bankAccountName: 'A' }, 400],
    [{ bankCode: 'VCB', bankAccountNumber: '12ab', bankAccountName: 'A' }, 400],
    [{ bankCode: 'VCB', bankAccountNumber: '0123456', bankAccountName: '' }, 400],
    [{ bankCode: 'VCB', bankAccountNumber: '0123456', bankAccountName: 'NGUYEN VAN A' }, 200],
  ]) {
    const db = fakeDb();
    const route = load('src/app/api/profile/bank/route.ts', { 'next/server': next, '@/lib/mobile/request-context': context(db.client), '@/lib/banks': banks });
    const res = await route.POST(new Request('https://api.test/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    assert.equal(res.status, status);
    assert.equal(db.log.updates.length, status === 200 ? 1 : 0);
    if (status === 200) assert.deepEqual(db.log.updates[0].row, { bank_code: 'VCB', bank_name: 'Vietcombank', bank_account_number: '0123456', bank_account_name: 'NGUYEN VAN A' });
  }
});
test('mobile bank route adds the bank list and forwards errors unchanged', async () => {
  let status = 200;
  const route = load('src/app/api/mobile/profile/bank/route.ts', {
    '@/app/api/profile/bank/route': { GET: async () => Response.json(status === 200 ? { bankCode: 'VCB' } : { error: 'Unauthorized' }, { status }), POST: async () => Response.json({ ok: true }) },
    '@/lib/banks': { VIETNAM_BANKS: [{ code: 'VCB', name: 'N', shortName: 'Vietcombank' }] },
    '@/lib/mobile/response': response,
  });
  const get = () => route.GET(new Request('https://api.test/x', { headers: { Authorization: 'Bearer t' } }));
  assert.deepEqual(await (await get()).json(), { bankCode: 'VCB', banks: [{ code: 'VCB', name: 'N', shortName: 'Vietcombank' }] });
  status = 401;
  const res = await get();
  assert.equal(res.status, 401); assert.deepEqual(await res.json(), { error: 'Unauthorized' });
});

test('dates: dd/mm/yyyy ↔ yyyy-mm-dd, rejecting impossible and future dates', () => {
  const profile = load('mobile-vinh/src/services/profile.ts', { './api': {}, './supabase': {} });
  assert.equal(profile.toIsoDate('2/5/1990'), '1990-05-02');
  assert.equal(profile.toIsoDate(' 29/02/2024 '), '2024-02-29');
  assert.equal(profile.toIsoDate(''), '');
  for (const bad of ['31/02/2020', '29/02/2023', '1990-05-02', '12/13/2000', '01/01/1800', '01/01/2999']) assert.equal(profile.toIsoDate(bad), null, bad);
  assert.equal(profile.fromIsoDate('1990-05-02'), '02/05/1990');
  assert.equal(profile.fromIsoDate(null), '');
});
test('picker dates keep the chosen calendar day in any time zone', () => {
  const profile = load('mobile-vinh/src/services/profile.ts', { './api': {}, './supabase': {} });
  // Late evening local time must not roll over to the next day (a UTC-based conversion would in UTC+7).
  assert.equal(profile.isoFromDate(new Date(1990, 4, 2, 23, 30)), '1990-05-02');
  assert.equal(profile.isoFromDate(new Date(2024, 1, 29, 0, 5)), '2024-02-29');
  const date = profile.dateFromIso('1990-05-02');
  assert.deepEqual([date.getFullYear(), date.getMonth(), date.getDate()], [1990, 4, 2]);
  assert.equal(profile.isoFromDate(profile.dateFromIso('2001-12-31')), '2001-12-31');
  assert.equal(profile.dateFromIso(''), null); assert.equal(profile.dateFromIso(null), null);
});
