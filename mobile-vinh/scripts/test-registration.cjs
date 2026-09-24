/* global __dirname */
// Registration, password reset and profile editing with fake Supabase clients: no real accounts or emails.
const { readFileSync } = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
function load(file, imports = {}, globals = {}) {
  const code = ts.transpileModule(readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', ...Object.keys(globals), code)(name => imports[name], exports, ...Object.values(globals));
  return exports;
}

function fakeDb({ usernameTaken = false, cccdTaken = false, fakeUser = false, profileError = null, ocrMatch = true } = {}) {
  const log = { signUps: [], inserts: [], uploads: [], deleted: [], ocr: 0 };
  const authClient = {
    auth: {
      signUp: async (args) => {
        log.signUps.push(args);
        return { data: { user: { id: 'new-user', identities: fakeUser ? [] : [{ id: 'i' }] } }, error: null };
      },
    },
  };
  const admin = {
    auth: { admin: { deleteUser: async (id) => { log.deleted.push(id); return {}; } } },
    storage: { from: (bucket) => ({ upload: async (p) => { log.uploads.push({ bucket, path: p }); return { error: null }; } }) },
    rpc: async () => ({ data: false, error: null }),
    from(table) {
      const query = {
        select() { return query; }, eq() { return query; }, neq() { return query; },
        limit() { return Promise.resolve({ data: table === 'identity_verifications' && cccdTaken ? [{ user_id: 'x' }] : [] }); },
        maybeSingle() { return Promise.resolve({ data: table === 'profiles' && usernameTaken ? { id: 'x' } : null }); },
        insert(row) {
          log.inserts.push({ table, row });
          return Promise.resolve({ error: table === 'profiles' ? profileError : null });
        },
      };
      return query;
    },
  };
  const registration = load('src/lib/registration.ts', {
    '@/lib/ocr': { verifyCccdAgainstImages: async () => { log.ocr++; return ocrMatch; } },
    '@/lib/redirect-target': { resolveRedirectTarget: (v) => (v && v.startsWith('/') ? v : '/') },
  });
  return { authClient, admin, log, registration };
}
function form(fields) {
  const f = new FormData();
  for (const [k, v] of Object.entries({ email: 'a@example.com', username: 'reader', nickname: 'Reader', password: 'secret123', ...fields })) {
    if (v !== undefined) f.append(k, v);
  }
  return f;
}
const image = () => new File([new Uint8Array([1, 2, 3])], 'side.jpg', { type: 'image/jpeg' });
async function register(db, fields) {
  const res = await db.registration.registerAccount(form(fields), { authClient: db.authClient, admin: db.admin, origin: 'https://api.test' });
  return { status: res.status, body: await res.json() };
}

test('account without CCCD: profile only, no OCR or private upload', async () => {
  const db = fakeDb();
  const res = await register(db, {});
  assert.deepEqual(res, { status: 200, body: { pendingConfirmation: true } });
  assert.equal(db.log.ocr, 0); assert.equal(db.log.uploads.length, 0);
  const profile = db.log.inserts.find(i => i.table === 'profiles').row;
  assert.deepEqual(profile, { id: 'new-user', username: 'reader', nickname: 'Reader' });
  assert.match(db.log.signUps[0].options.emailRedirectTo, /^https:\/\/api\.test\/api\/auth\/confirm\?next=%2F&flow=signup$/);
});
test('account with CCCD: OCR checked, images stored privately, verification approved', async () => {
  const db = fakeDb();
  const res = await register(db, { cccd: '012345678901', cccdFront: image(), cccdBack: image(), realname: 'Nguyễn A' });
  assert.equal(res.status, 200); assert.equal(db.log.ocr, 1);
  assert.deepEqual(db.log.uploads.map(u => u.bucket), ['identity-documents', 'identity-documents']);
  assert.ok(db.log.uploads.every(u => u.path.startsWith('new-user/')));
  const profile = db.log.inserts.find(i => i.table === 'profiles').row;
  assert.equal(profile.cccd_last4, '8901'); assert.equal(profile.cccd_verified, true); assert.equal(profile.real_name, 'Nguyễn A');
  assert.equal(db.log.inserts.find(i => i.table === 'identity_verifications').row.status, 'approved');
});
test('partial or invalid CCCD and OCR mismatch are rejected before creating the auth user', async () => {
  for (const fields of [{ cccd: '012345678901' }, { cccdFront: image() }, { cccd: '123', cccdFront: image(), cccdBack: image() }]) {
    const db = fakeDb();
    assert.equal((await register(db, fields)).status, 400); assert.equal(db.log.signUps.length, 0);
  }
  const db = fakeDb({ ocrMatch: false });
  assert.equal((await register(db, { cccd: '012345678901', cccdFront: image(), cccdBack: image() })).status, 400);
  assert.equal(db.log.signUps.length, 0);
  const missing = fakeDb();
  const res = await register(missing, { nickname: '' });
  assert.equal(res.status, 400); assert.match(res.body.error, /nickname/);
});
test('duplicate username or CCCD stop before signUp; existing email is reported', async () => {
  const u = fakeDb({ usernameTaken: true });
  assert.equal((await register(u, {})).status, 409); assert.equal(u.log.signUps.length, 0);
  const c = fakeDb({ cccdTaken: true });
  assert.equal((await register(c, { cccd: '012345678901', cccdFront: image(), cccdBack: image() })).status, 409);
  assert.equal(c.log.signUps.length, 0);
  const e = fakeDb({ fakeUser: true });
  const res = await register(e, {});
  assert.equal(res.status, 400); assert.match(res.body.error, /đã được đăng ký/); assert.equal(e.log.inserts.length, 0);
});
test('failed profile insert rolls back the new auth user', async () => {
  const db = fakeDb({ profileError: { code: '23505', message: 'dup' } });
  assert.equal((await register(db, {})).status, 409);
  assert.deepEqual(db.log.deleted, ['new-user']);
});

test('web route signs up with its SSR client; mobile route with the mobile project clients', async () => {
  const web = fakeDb(); const ssr = { auth: { signUp: async (a) => { web.log.signUps.push({ ssr: true, ...a }); return web.authClient.auth.signUp(a); } } };
  const rate = { checkRateLimit: () => true, getClientIp: () => '1.1.1.1' };
  const webRoute = load('src/app/api/auth/register/route.ts', {
    'next/server': { NextResponse: { json: (b, i) => Response.json(b, i) } },
    '@/lib/supabase/server': { createClient: async () => ssr, createServiceRoleClient: () => web.admin },
    '@/lib/rate-limit': rate, '@/lib/registration': web.registration,
  });
  let res = await webRoute.POST(new Request('https://web.test/api/auth/register', { method: 'POST', body: form({}) }));
  assert.equal(res.status, 200); assert.equal(web.log.signUps[0].ssr, true);

  const mobile = fakeDb();
  const mobileRoute = load('src/app/api/mobile/auth/register/route.ts', {
    '@/lib/mobile/request-context': { getMobileClients: () => ({ anon: mobile.authClient, admin: mobile.admin }) },
    '@/lib/mobile/response': load('src/lib/mobile/response.ts'), '@/lib/rate-limit': rate, '@/lib/registration': mobile.registration,
  });
  res = await mobileRoute.POST(new Request('https://api.test/api/mobile/auth/register', { method: 'POST', body: form({}) }));
  assert.equal(res.status, 200); assert.equal(res.headers.get('cache-control'), 'private, no-store');
  assert.equal(mobile.log.inserts[0].table, 'profiles');

  const limited = load('src/app/api/mobile/auth/register/route.ts', {
    '@/lib/mobile/request-context': { getMobileClients: () => { throw Error('must not be called'); } },
    '@/lib/mobile/response': load('src/lib/mobile/response.ts'), '@/lib/rate-limit': { checkRateLimit: () => false, getClientIp: () => 'x' },
    '@/lib/registration': mobile.registration,
  });
  res = await limited.POST(new Request('https://api.test/api/mobile/auth/register', { method: 'POST', body: form({}) }));
  assert.equal(res.status, 429);
});

test('public legal route serves only the sign-up documents', async () => {
  const route = load('src/app/api/mobile/legal/[docId]/route.ts', {
    '@/lib/mobile/response': load('src/lib/mobile/response.ts'),
    '@/lib/legal/registry': { getAgreement: (id) => ({ id, name: 'Doc ' + id, updatedAt: '01012026', html: '<p>x</p>' }) },
    '@/lib/legal/contract-parties': { AGREEMENT_PARTY_INFO: { 'chinh-sach-doc-quyen': {} } },
  });
  const get = (docId) => route.GET(new Request('https://api.test/x'), { params: Promise.resolve({ docId }) });
  assert.equal((await get('dieu-khoan-su-dung')).status, 200);
  assert.equal((await get('chinh-sach-bao-mat')).status, 200);
  assert.equal((await get('chinh-sach-doc-quyen')).status, 404);
  assert.equal((await get('../secret')).status, 404);
});

test('mobile image actions map onto the web signed-upload handlers', async () => {
  const calls = [];
  const handler = (name) => async (req) => { calls.push({ name, method: req.method, body: req.method === 'DELETE' ? null : await req.json(), auth: req.headers.get('authorization') }); return Response.json({ ok: true }); };
  const route = load('src/app/api/mobile/profile/avatar/route.ts', {
    '@/app/api/profile/avatar/route': { GET: handler('GET'), POST: handler('POST'), PATCH: handler('PATCH'), DELETE: handler('DELETE') },
    '@/lib/mobile/image-actions': load('src/lib/mobile/image-actions.ts'),
    '@/lib/mobile/response': load('src/lib/mobile/response.ts'),
  });
  const post = (body, token = 'valid') => route.POST(new Request('https://api.test/api/mobile/profile/avatar', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body),
  }));
  await post({ action: 'upload-url', contentType: 'image/jpeg', path: 'ignored' });
  await post({ action: 'confirm', path: 'u/avatar-1.jpg', contentType: 'ignored' });
  await post({ action: 'remove' });
  assert.deepEqual(calls.map(c => [c.name, c.method, c.body]), [
    ['POST', 'POST', { contentType: 'image/jpeg' }], ['PATCH', 'PATCH', { path: 'u/avatar-1.jpg' }], ['DELETE', 'DELETE', null]]);
  assert.ok(calls.every(c => c.auth === 'Bearer valid'));
  assert.equal((await post({ action: 'other' })).status, 400);
  assert.equal((await post({ action: 'remove' }, null)).status, 401);
  assert.equal(calls.length, 3);
});

function appAuth({ error = null } = {}) {
  const calls = [];
  const auth = new Proxy({}, { get: (_t, name) => async (...args) => { calls.push({ name, args }); return { data: {}, error }; } });
  const requests = [];
  const api = load('mobile-vinh/src/services/api.ts', { './supabase': { requireSupabase: () => ({ auth }) } }, {
    process: { env: { EXPO_PUBLIC_API_URL: 'https://api.test/' } },
    fetch: async (url, options) => { requests.push({ url, options }); return Response.json({ pendingConfirmation: true, available: false }); },
  });
  const service = load('mobile-vinh/src/services/auth.ts', { './supabase': { requireSupabase: () => ({ auth }) }, './api': api });
  return { service, calls, requests };
}
test('app: registration posts multipart without a token; codes use the right OTP types', async () => {
  const f = appAuth();
  const body = new FormData(); body.append('email', 'a@example.com');
  await f.service.registerAccount(body);
  assert.equal(f.requests[0].url, 'https://api.test/api/mobile/auth/register');
  assert.equal(f.requests[0].options.method, 'POST'); assert.equal(f.requests[0].options.body, body);
  assert.equal(f.requests[0].options.headers, undefined);
  assert.equal(await f.service.isAvailable('username', ' reader '), false);
  assert.equal(f.requests[1].url, 'https://api.test/api/mobile/auth/check-availability?field=username&value=reader');
  await f.service.verifySignupCode(' A@Example.com ', '123456');
  await f.service.verifyPasswordResetCode('a@example.com', '12345678');
  assert.deepEqual(f.calls.map(c => [c.name, c.args[0].type, c.args[0].email]), [
    ['verifyOtp', 'signup', 'a@example.com'], ['verifyOtp', 'recovery', 'a@example.com']]);
  await assert.rejects(f.service.verifySignupCode('a@example.com', '12'));
  assert.equal(f.calls.length, 2);
});
test('app: password reset does not reveal unknown emails; new password is validated first', async () => {
  const quiet = appAuth({ error: { code: 'user_not_found' } });
  await quiet.service.sendPasswordResetCode('nobody@example.com');
  const limited = appAuth({ error: { code: 'over_email_send_rate_limit' } });
  await assert.rejects(limited.service.sendPasswordResetCode('a@example.com'), /quá nhiều lần/);
  const f = appAuth();
  assert.equal(f.service.passwordProblem('short', 'short'), 'Mật khẩu phải có ít nhất 8 ký tự.');
  await assert.rejects(f.service.setNewPassword('longenough', 'different'), /chưa khớp/);
  assert.equal(f.calls.length, 0);
  await f.service.setNewPassword('longenough', 'longenough');
  assert.deepEqual(f.calls[0], { name: 'updateUser', args: [{ password: 'longenough' }] });
});

test('app: profile image goes URL → signed upload → confirm, and stops if the upload fails', async () => {
  for (const uploadError of [null, { message: 'denied' }]) {
    const steps = [];
    const storage = { from: (bucket) => ({ uploadToSignedUrl: async (p, token, bytes, opts) => {
      steps.push(['upload', bucket, p, token, bytes.byteLength, opts.contentType]); return { error: uploadError };
    } }) };
    const profile = load('mobile-vinh/src/services/profile.ts', {
      './api': { mobileApi: async (p, userId, body) => { steps.push(['api', p, body.action]); return body.action === 'upload-url' ? { path: 'u/avatar-1.jpg', token: 't' } : { avatarUrl: 'https://cdn/u/avatar-1.jpg' }; } },
      './supabase': { requireSupabase: () => ({ storage }) },
    }, { fetch: async () => new Response(new Uint8Array([1, 2, 3, 4])) });
    const run = profile.uploadProfileImage('u', 'avatar', { uri: 'file:///a.jpg', type: 'image/jpeg' });
    if (uploadError) {
      await assert.rejects(run, /ảnh đại diện/);
      assert.deepEqual(steps.map(s => s[0] + ':' + (s[2] ?? '')), ['api:upload-url', 'upload:u/avatar-1.jpg']);
    } else {
      assert.equal(await run, 'https://cdn/u/avatar-1.jpg');
      assert.deepEqual(steps, [['api', 'profile/avatar', 'upload-url'], ['upload', 'avatars', 'u/avatar-1.jpg', 't', 4, 'image/jpeg'], ['api', 'profile/avatar', 'confirm']]);
    }
  }
});
