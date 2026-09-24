/* global __dirname */
// Order actions (Phase 4b) with fake handlers/storage: no real orders, files or payments.
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
const next = { NextResponse: { json: (b, i) => Response.json(b, i) } };
const response = load('src/lib/mobile/response.ts');
const ORDER = '00000000-0000-0000-0000-0000000000d1';
const SELLER = '00000000-0000-0000-0000-00000000000s';
const BUYER = '00000000-0000-0000-0000-00000000000b';

function dispatcher() {
  const calls = [];
  const handler = (name) => async (req, ctx) => {
    calls.push({ name, method: req.method, body: await req.json(), params: await ctx.params, auth: req.headers.get('authorization') });
    return Response.json({ ok: true });
  };
  const mod = (names) => Object.fromEntries(names.map(([exp, name]) => [exp, handler(name)]));
  const route = load('src/app/api/mobile/orders/[orderId]/action/route.ts', {
    '@/app/api/orders/[orderId]/scope/route': mod([['POST', 'scope']]),
    '@/app/api/orders/[orderId]/brief/route': mod([['PATCH', 'save-brief'], ['POST', 'confirm-brief']]),
    '@/app/api/orders/[orderId]/draft/route': mod([['POST', 'draft']]),
    '@/app/api/orders/[orderId]/draft/approve/route': mod([['POST', 'approve']]),
    '@/app/api/orders/[orderId]/draft/revise/route': mod([['POST', 'revise']]),
    '@/app/api/orders/[orderId]/deliver/route': mod([['POST', 'deliver']]),
    '@/app/api/orders/[orderId]/deliver/upload-url/route': mod([['POST', 'upload-url']]),
    '@/app/api/orders/[orderId]/confirm/route': mod([['POST', 'confirm']]),
    '@/app/api/orders/[orderId]/attach-book/route': mod([['POST', 'attach']]),
    '@/app/api/orders/[orderId]/original-file/route': mod([['POST', 'request-original']]),
    '@/app/api/orders/[orderId]/original-file/[requestId]/route': mod([['PATCH', 'resolve-original']]),
    '@/app/api/orders/[orderId]/cancel/route': mod([['POST', 'cancel']]),
    '@/app/api/orders/[orderId]/cancel/[requestId]/route': mod([['PATCH', 'resolve-cancel']]),
    '@/app/api/orders/[orderId]/lost-contact/reminder/route': mod([['POST', 'reminder']]),
    '@/app/api/orders/[orderId]/lost-contact/report/route': mod([['POST', 'report']]),
    '@/app/api/orders/[orderId]/dispute/route': mod([['POST', 'dispute']]),
    '@/app/api/orders/[orderId]/author-name-agreement/route': mod([['POST', 'agreement']]),
    '@/app/api/orders/[orderId]/author-name-agreement/[agreementId]/route': mod([['PATCH', 'agreement-confirm']]),
    '@/lib/mobile/response': response,
  });
  const post = (body, token = 't') => route.POST(new Request(`https://api.test/api/mobile/orders/${ORDER}/action`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ orderId: ORDER }) });
  return { post, calls };
}

test('dispatcher maps each action to the web handler with only its own fields', async () => {
  const d = dispatcher();
  const cases = [
    [{ action: 'set-scope', usageScope: 'personal', scopeNote: null, amount: 9 }, 'scope', 'POST', { usageScope: 'personal', scopeNote: null }],
    [{ action: 'save-brief', brief: 'Vẽ bìa', status: 'completed' }, 'save-brief', 'PATCH', { brief: 'Vẽ bìa' }],
    [{ action: 'confirm-brief', brief: 'x' }, 'confirm-brief', 'POST', {}],
    [{ action: 'submit-draft', asset: { hacked: true } }, 'draft', 'POST', { asset: {} }],
    [{ action: 'request-revision', note: 'Sửa màu' }, 'revise', 'POST', { note: 'Sửa màu' }],
    [{ action: 'deliver', uploadPath: `${ORDER}/upload-1.mp3`, asset: { x: 1 } }, 'deliver', 'POST', { uploadPath: `${ORDER}/upload-1.mp3` }],
    [{ action: 'deliver' }, 'deliver', 'POST', {}],
    [{ action: 'deliver-upload-url', contentType: 'audio/mpeg' }, 'upload-url', 'POST', { contentType: 'audio/mpeg' }],
    [{ action: 'resolve-original', requestId: 'r1', agree: 'yes' }, 'resolve-original', 'PATCH', { agree: false }],
  ];
  for (const [body, name, method, forwarded] of cases) {
    assert.equal((await d.post(body)).status, 200);
    const call = d.calls.at(-1);
    assert.deepEqual([call.name, call.method, call.body], [name, method, forwarded], body.action);
    assert.equal(call.auth, 'Bearer t'); assert.equal(call.params.orderId, ORDER);
  }
  assert.equal(d.calls.at(-1).params.requestId, 'r1');
});
test('dispatcher has no payment action and rejects unknown or unauthenticated calls', async () => {
  const d = dispatcher();
  for (const action of ['deposit', 'pay', 'cancel', '__proto__', undefined]) assert.equal((await d.post({ action, amount: 1 })).status, 400);
  assert.equal((await d.post({ action: 'confirm-received' }, null)).status, 401);
  assert.equal(d.calls.length, 0);
});

function deliverDb({ status = 'in_progress', seller = SELLER, serviceType = 'voice', staged = { size: 4, type: 'audio/mpeg' } } = {}) {
  const log = { uploads: [], downloads: [], removed: [], inserts: [], signed: [] };
  const client = {
    storage: { from: (bucket) => ({
      upload: async (p, _buf, opts) => { log.uploads.push({ bucket, path: p, type: opts.contentType }); return { error: null }; },
      download: async (p) => { log.downloads.push(p); return staged ? { data: new Blob([new Uint8Array(staged.size)], { type: staged.type }), error: null } : { data: null, error: 'missing' }; },
      remove: async (paths) => { log.removed.push(...paths); return { error: null }; },
      createSignedUploadUrl: async (p) => { log.signed.push(p); return { data: { path: p, token: 'tok' }, error: null }; },
    }) },
    from(table) {
      const q = { select() { return q; }, eq() { return q; },
        maybeSingle: async () => ({ data: table === 'orders' ? { id: ORDER, code: 'DH-1', status, seller_id: seller, buyer_id: BUYER, listing_id: 'l', service_listings: { service_type: serviceType } } : { nickname: 'B', username: 'b' } }),
        insert: async (row) => { log.inserts.push(row); return { error: null }; } };
      return q;
    },
  };
  const ctx = { getRequestContext: async () => ({ client, userId: SELLER }), requestError: () => Response.json({}, { status: 401 }) };
  const delivered = [];
  const deliverRoute = load('src/app/api/orders/[orderId]/deliver/route.ts', {
    'next/server': next, '@/lib/mobile/request-context': ctx,
    '@/lib/orders/order-service': { OrderService: { deliver: async (_c, p) => { delivered.push(p); return { id: ORDER, status: 'delivered' }; } } },
    '@/lib/orders/watermark': { applyIllustrationWatermark: async (buf) => buf },
  });
  const uploadRoute = load('src/app/api/orders/[orderId]/deliver/upload-url/route.ts', { 'next/server': next, '@/lib/mobile/request-context': ctx });
  const params = { params: Promise.resolve({ orderId: ORDER }) };
  const json = (body) => new Request('https://api.test/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { log, delivered, deliver: (req) => deliverRoute.POST(req, params), uploadUrl: (body) => uploadRoute.POST(json(body), params), json };
}

test('deliver: large files come from the order\'s own staging folder, then the staged copy is removed', async () => {
  const f = deliverDb();
  const res = await f.deliver(f.json({ uploadPath: `${ORDER}/upload-1.mp3` }));
  assert.equal(res.status, 200);
  assert.deepEqual(f.log.downloads, [`${ORDER}/upload-1.mp3`]);
  assert.equal(f.log.uploads.length, 1); assert.match(f.log.uploads[0].path, new RegExp(`^${ORDER}/voice_original-\\d+\\.mp3$`));
  assert.equal(f.log.uploads[0].bucket, 'order-deliverables');
  assert.deepEqual(f.log.removed, [`${ORDER}/upload-1.mp3`]);
  assert.equal(f.delivered.length, 1); assert.match(f.delivered[0].asset.streamPath, /voice_original/);
});
test('deliver: other orders\' paths, traversal, wrong status and wrong type store nothing', async () => {
  for (const uploadPath of [`00000000-0000-0000-0000-0000000000d2/upload-1.mp3`, `${ORDER}/upload-../../x`, `${ORDER}/voice_original-1.mp3`, '']) {
    const f = deliverDb();
    assert.equal((await f.deliver(f.json({ uploadPath }))).status, 400, uploadPath);
    assert.equal(f.log.downloads.length + f.log.uploads.length + f.delivered.length, 0);
  }
  const closed = deliverDb({ status: 'delivered' });
  assert.equal((await closed.deliver(closed.json({ uploadPath: `${ORDER}/upload-1.mp3` }))).status, 400);
  assert.equal(closed.log.downloads.length + closed.log.uploads.length + closed.log.inserts.length, 0);
  const wrongType = deliverDb({ staged: { size: 4, type: 'image/png' } });
  assert.equal((await wrongType.deliver(wrongType.json({ uploadPath: `${ORDER}/upload-1.png` }))).status, 400);
  assert.equal(wrongType.log.uploads.length + wrongType.delivered.length, 0);
});
test('deliver: web multipart upload still works; ghostwriting needs no file', async () => {
  const f = deliverDb();
  const form = new FormData(); form.append('file', new File([new Uint8Array(3)], 'a.mp3', { type: 'audio/mpeg' }));
  assert.equal((await f.deliver(new Request('https://api.test/x', { method: 'POST', body: form }))).status, 200);
  assert.equal(f.log.downloads.length, 0); assert.equal(f.log.uploads.length, 1);
  const g = deliverDb({ serviceType: 'ghostwriting' });
  assert.equal((await g.deliver(g.json({}))).status, 200);
  assert.equal(g.log.uploads.length, 0); assert.deepEqual(g.delivered[0].asset, {});
});
test('upload URL: seller only, while in progress, matching file type, into the staging folder', async () => {
  const ok = deliverDb();
  const res = await ok.uploadUrl({ contentType: 'audio/wav' });
  assert.equal(res.status, 200); assert.match((await res.json()).path, new RegExp(`^${ORDER}/upload-\\d+\\.wav$`));
  assert.equal((await deliverDb({ seller: BUYER }).uploadUrl({ contentType: 'audio/wav' })).status, 404);
  assert.equal((await deliverDb({ status: 'draft' }).uploadUrl({ contentType: 'audio/wav' })).status, 400);
  assert.equal((await deliverDb().uploadUrl({ contentType: 'image/png' })).status, 400);
  assert.equal((await deliverDb({ serviceType: 'ghostwriting' }).uploadUrl({ contentType: 'audio/wav' })).status, 400);
});

test('pending requests are visible to both parties, and only to them', async () => {
  const mk = (order) => load('src/app/api/orders/[orderId]/requests/route.ts', {
    'next/server': next,
    '@/lib/mobile/request-context': { getRequestContext: async () => ({ client: { from(table) {
      const q = { select() { return q; }, eq() { return q; }, order() { return q; }, limit() { return q; },
        maybeSingle: async () => ({ data: table === 'order_file_requests' ? { id: 'f1', status: 'pending', requested_by: BUYER } : { id: 'c1', refund_amount: 300 }, error: null }) };
      return q;
    } }, userId: SELLER }), requestError: () => Response.json({}, { status: 401 }) },
    '@/lib/orders/order-service': { getOrderForActor: async () => order },
  });
  const params = { params: Promise.resolve({ orderId: ORDER }) };
  const body = await (await mk({ id: ORDER }).GET(new Request('https://api.test/x'), params)).json();
  assert.equal(body.fileRequest.requested_by, BUYER); assert.equal(body.cancelRequest.refund_amount, 300);
  assert.equal((await mk(null).GET(new Request('https://api.test/x'), params)).status, 404);
});

test('app: delivery uploads to the signed URL before finalising, and stops on upload failure', async () => {
  for (const uploadError of [null, { message: 'denied' }]) {
    const steps = [];
    const orders = load('mobile-vinh/src/services/orders.ts', {
      './api': { mobileApi: async (p, _u, body, opts) => { steps.push(['api', body.action, body.uploadPath, opts?.timeoutMs]); return body.action === 'deliver-upload-url' ? { path: `${ORDER}/upload-1.mp3`, token: 'tok' } : { order: {} }; } },
      './supabase': { requireSupabase: () => ({ storage: { from: (bucket) => ({ uploadToSignedUrl: async (p, token, bytes, opt) => {
        steps.push(['upload', bucket, p, token, bytes.byteLength, opt.contentType]); return { error: uploadError };
      } }) } }) },
    }, { fetch: async () => new Response(new Uint8Array(5)) });
    const run = orders.deliverWithFile('u', ORDER, { uri: 'file:///a.mp3', name: 'a.mp3', mimeType: 'audio/mpeg', size: 5 });
    if (uploadError) {
      await assert.rejects(run, /Tải tệp bàn giao thất bại/);
      assert.deepEqual(steps.map(s => s[0]), ['api', 'upload']);
    } else {
      await run;
      assert.deepEqual(steps, [['api', 'deliver-upload-url', undefined, undefined], ['upload', 'order-deliverables', `${ORDER}/upload-1.mp3`, 'tok', 5, 'audio/mpeg'],
        ['api', 'deliver', `${ORDER}/upload-1.mp3`, 120000]]);
    }
  }
  const orders = load('mobile-vinh/src/services/orders.ts', { './api': { mobileApi: async () => { throw new Error('should not be called'); } }, './supabase': {} });
  await assert.rejects(orders.deliverWithFile('u', ORDER, { uri: 'x', name: 'big.wav', mimeType: 'audio/wav', size: 31 * 1024 * 1024 }), /30 MB/);
});
