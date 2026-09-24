/* global __dirname */
// Cancel, lost contact, disputes and author-name agreements (Phase 4c) with fake handlers: nothing real changes.
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
const ORDER = '00000000-0000-0000-0000-0000000000d1';
const ME = '00000000-0000-0000-0000-00000000000a';
const OTHER = '00000000-0000-0000-0000-00000000000b';

test('dispatcher forwards 4c actions with only their fields and ids', async () => {
  const calls = [];
  const handler = (name) => async (req, ctx) => { calls.push({ name, method: req.method, body: await req.json(), params: await ctx.params }); return Response.json({ ok: true }); };
  const stub = (...pairs) => Object.fromEntries(pairs.map(([exp, name]) => [exp, handler(name)]));
  const imports = { '@/lib/mobile/response': load('src/lib/mobile/response.ts') };
  for (const p of ['scope', 'draft', 'draft/approve', 'draft/revise', 'deliver', 'deliver/upload-url', 'confirm', 'attach-book', 'original-file'])
    imports[`@/app/api/orders/[orderId]/${p}/route`] = stub(['POST', p]);
  imports['@/app/api/orders/[orderId]/brief/route'] = stub(['PATCH', 'brief'], ['POST', 'brief-confirm']);
  imports['@/app/api/orders/[orderId]/original-file/[requestId]/route'] = stub(['PATCH', 'original-resolve']);
  imports['@/app/api/orders/[orderId]/cancel/route'] = stub(['POST', 'cancel']);
  imports['@/app/api/orders/[orderId]/cancel/[requestId]/route'] = stub(['PATCH', 'cancel-resolve']);
  imports['@/app/api/orders/[orderId]/lost-contact/reminder/route'] = stub(['POST', 'reminder']);
  imports['@/app/api/orders/[orderId]/lost-contact/report/route'] = stub(['POST', 'report']);
  imports['@/app/api/orders/[orderId]/dispute/route'] = stub(['POST', 'dispute']);
  imports['@/app/api/orders/[orderId]/author-name-agreement/route'] = stub(['POST', 'agreement']);
  imports['@/app/api/orders/[orderId]/author-name-agreement/[agreementId]/route'] = stub(['PATCH', 'agreement-confirm']);
  const route = load('src/app/api/mobile/orders/[orderId]/action/route.ts', imports);
  const post = (body) => route.POST(new Request('https://api.test/x', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ orderId: ORDER }) });
  const cases = [
    [{ action: 'request-cancel', refund_amount: 999 }, 'cancel', 'POST', {}, {}],
    [{ action: 'resolve-cancel', requestId: 'c1', agree: true, refund: 5 }, 'cancel-resolve', 'PATCH', { agree: true }, { requestId: 'c1' }],
    [{ action: 'send-reminder', targetUserId: OTHER }, 'reminder', 'POST', {}, {}],
    [{ action: 'report-lost-contact' }, 'report', 'POST', {}, {}],
    [{ action: 'open-dispute', reasonCategory: 'other', description: 'Chậm', status: 'cancelled' }, 'dispute', 'POST', { reasonCategory: 'other', description: 'Chậm' }, {}],
    [{ action: 'start-author-agreement', choice: 'co_authorship', ghostwriterSampleVisible: 'yes', customerProfileVisible: true },
      'agreement', 'POST', { choice: 'co_authorship', ghostwriterSampleVisible: false, customerProfileVisible: true }, {}],
    [{ action: 'confirm-author-agreement', agreementId: 'a1', choice: 'customer_name' }, 'agreement-confirm', 'PATCH', {}, { agreementId: 'a1' }],
  ];
  for (const [body, name, method, forwarded, ids] of cases) {
    assert.equal((await post(body)).status, 200, body.action);
    const call = calls.at(-1);
    assert.deepEqual([call.name, call.method, call.body], [name, method, forwarded], body.action);
    for (const [k, v] of Object.entries(ids)) assert.equal(call.params[k], v);
    assert.equal(call.params.orderId, ORDER);
  }
});

const ctx = (userId = ME) => ({ getRequestContext: async () => ({ client: {}, userId }), requestError: () => Response.json({}, { status: 401 }) });
const params = { params: Promise.resolve({ orderId: ORDER }) };
test('cancel preview uses the caller\'s side and explains a missing refund policy', async () => {
  const sides = [];
  const mk = (fail) => load('src/app/api/orders/[orderId]/cancel/route.ts', {
    'next/server': next, '@/lib/mobile/request-context': ctx(),
    '@/lib/orders/order-service': {
      getOrderForActor: async () => ({ id: ORDER, buyer_id: OTHER, seller_id: ME }),
      OrderService: { calculateRefund: async (_c, p) => { sides.push(p.cancelledBy); if (fail) throw new Error('NO_REFUND_POLICY'); return { pct: 50, refund_amount: 300 }; } },
    },
  });
  const ok = await mk(false).GET(new Request('https://api.test/x'), params);
  assert.deepEqual(await ok.json(), { preview: { pct: 50, refund_amount: 300 } });
  const res = await mk(true).GET(new Request('https://api.test/x'), params);
  assert.equal(res.status, 400); assert.match((await res.json()).error, /chưa có chính sách hoàn tiền/);
  assert.deepEqual(sides, ['seller', 'seller']);
});
test('lost-contact report is refused until the reminder/silence windows have passed', async () => {
  for (const eligible of [false, true]) {
    let reported = 0;
    const route = load('src/app/api/orders/[orderId]/lost-contact/report/route.ts', {
      'next/server': next, '@/lib/mobile/request-context': ctx(),
      '@/lib/orders/order-service': { getOrderForActor: async () => ({ id: ORDER, buyer_id: ME, seller_id: OTHER }),
        OrderService: { reportLostContact: async () => { reported++; return { id: 'e1' }; } } },
      '@/lib/orders/lost-contact': { canReportLostContact: async () => ({ eligible, firstReminderAt: null, lastMessageAt: null }) },
    });
    const res = await route.POST(new Request('https://api.test/x', { method: 'POST' }), params);
    assert.equal(res.status, eligible ? 200 : 400); assert.equal(reported, eligible ? 1 : 0);
  }
});
test('reminder always targets the other party of the order', async () => {
  const targets = [];
  for (const [me, expected] of [[ME, OTHER], [OTHER, ME]]) {
    const route = load('src/app/api/orders/[orderId]/lost-contact/reminder/route.ts', {
      'next/server': next, '@/lib/mobile/request-context': ctx(me),
      '@/lib/orders/order-service': { getOrderForActor: async () => ({ id: ORDER, buyer_id: ME, seller_id: OTHER }),
        OrderService: { sendReminder: async (_c, p) => { targets.push([p.actorId, p.targetUserId]); return {}; } } },
    });
    await route.POST(new Request('https://api.test/x', { method: 'POST' }), params);
    assert.deepEqual(targets.at(-1), [me, expected]);
  }
});
test('dispute needs a reason and description; author agreement only after delivery with a valid choice', async () => {
  const opened = [];
  const dispute = load('src/app/api/orders/[orderId]/dispute/route.ts', {
    'next/server': next, '@/lib/mobile/request-context': ctx(),
    '@/lib/orders/dispute-service': { DisputeService: { open: async (_c, p) => { opened.push(p); return { id: 'd1' }; } } },
  });
  const post = (route, body) => route.POST(new Request('https://api.test/x', { method: 'POST', body: JSON.stringify(body) }), params);
  assert.equal((await post(dispute, { reasonCategory: 'other', description: '  ' })).status, 400);
  assert.equal((await post(dispute, { reasonCategory: 'other', description: ' Chậm ' })).status, 200);
  assert.deepEqual(opened, [{ orderId: ORDER, reporterId: ME, reasonCategory: 'other', description: 'Chậm' }]);
  for (const [status, choice, expected] of [['in_progress', 'customer_name', 400], ['delivered', 'someone_else', 400], ['completed', 'co_authorship', 200]]) {
    const agreement = load('src/app/api/orders/[orderId]/author-name-agreement/route.ts', {
      'next/server': next, '@/lib/mobile/request-context': ctx(),
      '@/lib/orders/order-service': { getOrderForActor: async () => ({ id: ORDER, status }) },
      '@/lib/orders/author-name-agreement-service': { AuthorNameAgreementService: { initiate: async () => ({ id: 'a1' }) } },
    });
    assert.equal((await post(agreement, { choice })).status, expected, `${status}/${choice}`);
  }
});
