/* global __dirname */
// Quests and achievements through the shared routes with fake services: no real rewards are granted.
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
const context = (userId = 'reader') => ({
  getRequestContext: async () => ({ client: fakeClient(), userId }), requestError: () => Response.json({ error: 'x' }, { status: 401 }),
});
const templates = [
  { id: 't2', title: 'Đọc 3 chương', description: null, quest_type: 'engagement', target_count: 3, reward_tokens: 20 },
  { id: 't1', title: 'Khám phá thể loại mới', description: 'd', quest_type: 'discovery', target_count: 1, reward_tokens: 10 },
];
const dailies = [
  { id: 'd1', template_id: 't1', progress: 1, completed: true, claimed: false, reset_count: 0 },
  { id: 'd2', template_id: 't2', progress: 2, completed: false, claimed: false, reset_count: 1 },
];
function fakeClient() {
  return { from(table) {
    const q = { select() { return q; }, eq() { return q; }, in() { return q; },
      then(resolve) { return resolve({ data: table === 'task_templates' ? templates : dailies, error: null }); } };
    return q;
  } };
}
const poolRows = [
  { pool_date: '2026-09-24', slot_index: 2, task_template_id: 't2' },
  { pool_date: '2026-09-24', slot_index: 1, task_template_id: 't1' },
  { pool_date: '2026-09-24', slot_index: 3, task_template_id: 'missing' },
];
function poolRoute({ rows = poolRows, generateError = null, userId = 'reader' } = {}) {
  return load('src/app/api/quests/pool/route.ts', {
    'next/server': next, '@/lib/mobile/request-context': context(userId), '@/lib/quests/config': { MAX_QUEST_RESETS_PER_DAY: 3 },
    '@/lib/quests/quest-pool-service': { QuestPoolService: {
      generateTodayPool: async () => (generateError ? { ok: false, error: generateError } : { ok: true, data: rows }),
      getResetsUsedToday: async () => 1,
    } },
  });
}

test('pool joins templates with progress, sorts by slot and drops inconsistent rows', async () => {
  const res = await poolRoute().GET(new Request('https://api.test/x'));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.poolDate, '2026-09-24'); assert.equal(body.resetsUsedToday, 1); assert.equal(body.maxResetsPerDay, 3);
  assert.deepEqual(body.slots.map(s => [s.slotIndex, s.taskTemplateId, s.userDailyTaskId, s.progress, s.completed]), [
    [1, 't1', 'd1', 1, true], [2, 't2', 'd2', 2, false]]);
  assert.equal(body.slots[1].rewardTokens, 20); assert.equal(body.slots[1].questType, 'engagement');
});
test('empty pool, generation failure and signed-out callers', async () => {
  assert.deepEqual(await (await poolRoute({ rows: [] }).GET(new Request('https://api.test/x'))).json(),
    { poolDate: null, slots: [], resetsUsedToday: 0, maxResetsPerDay: 3 });
  assert.equal((await poolRoute({ generateError: 'Không còn quest' }).GET(new Request('https://api.test/x'))).status, 400);
  assert.equal((await poolRoute({ userId: null }).GET(new Request('https://api.test/x'))).status, 401);
});
test('claim and reset pass the caller and ids straight to the reward services', async () => {
  const calls = [];
  const claim = load('src/app/api/quests/claim/route.ts', {
    'next/server': next, '@/lib/mobile/request-context': context(),
    '@/lib/quests/reward-engine': { RewardEngine: { claimDailyTask: async (_c, p) => { calls.push(['claim', p]); return p.taskId === 'bad' ? { ok: false, error: 'Đã nhận rồi' } : { ok: true, data: { id: 'tx' } }; } } },
  });
  const reset = load('src/app/api/quests/reset/route.ts', {
    'next/server': next, '@/lib/mobile/request-context': context(),
    '@/lib/quests/quest-pool-service': { QuestPoolService: { resetQuestInPool: async (_c, p) => { calls.push(['reset', p]); return { ok: true, data: {} }; } } },
  });
  const post = (route, body) => route.POST(new Request('https://api.test/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  assert.equal((await post(claim, { taskId: 'd1' })).status, 200);
  assert.equal((await post(claim, { taskId: 'bad' })).status, 400);
  assert.equal((await post(claim, {})).status, 400);
  assert.equal((await post(reset, { taskTemplateId: 't2' })).status, 200);
  assert.equal((await post(reset, { taskId: 't2' })).status, 400);
  assert.deepEqual(calls, [['claim', { userId: 'reader', taskId: 'd1' }], ['claim', { userId: 'reader', taskId: 'bad' }],
    ['reset', { userId: 'reader', taskTemplateId: 't2' }]]);
});
test('mobile quest and achievement routes require a token and are never cached', async () => {
  const handler = async () => Response.json({ ok: true });
  const routes = [
    ['GET', load('src/app/api/mobile/quests/route.ts', { '@/app/api/quests/pool/route': { GET: handler }, '@/lib/mobile/response': response })],
    ['POST', load('src/app/api/mobile/quests/claim/route.ts', { '@/app/api/quests/claim/route': { POST: handler }, '@/lib/mobile/response': response })],
    ['POST', load('src/app/api/mobile/quests/reset/route.ts', { '@/app/api/quests/reset/route': { POST: handler }, '@/lib/mobile/response': response })],
    ['GET', load('src/app/api/mobile/achievements/route.ts', { '@/app/api/achievements/route': { GET: handler }, '@/lib/mobile/response': response })],
  ];
  for (const [method, route] of routes) {
    const ok = await route[method](new Request('https://api.test/x', { method, headers: { Authorization: 'Bearer t' } }));
    assert.equal(ok.status, 200); assert.equal(ok.headers.get('cache-control'), 'private, no-store');
    assert.equal((await route[method](new Request('https://api.test/x', { method }))).status, 401);
  }
});

test('app: quest calls use the right ids; achievements group by role like the web', async () => {
  const calls = [];
  const quests = load('mobile-vinh/src/services/quests.ts', { './api': { mobileApi: async (p, userId, body) => {
    calls.push([p, userId, body]);
    return p === 'achievements' ? { achievements: [
      { id: 'a', forRole: 'narrator', unlocked: true }, { id: 'b', forRole: null, unlocked: false }, { id: 'c', forRole: 'author', unlocked: false },
    ] } : { ok: true };
  } } });
  await quests.claimQuest('u', 'd1');
  await quests.resetQuest('u', 't2');
  const list = await quests.getAchievements('u');
  assert.deepEqual(calls.slice(0, 2), [['quests/claim', 'u', { taskId: 'd1' }], ['quests/reset', 'u', { taskTemplateId: 't2' }]]);
  assert.deepEqual(quests.groupByRole(list).map(g => [g.role, g.items.map(i => i.id)]), [['reader', ['b']], ['author', ['c']], ['narrator', ['a']]]);
  assert.equal(quests.questTypeLabel('lore_hunt'), 'Truy tìm chi tiết');
  assert.equal(quests.questTypeLabel(null), 'Nhiệm vụ'); assert.equal(quests.questTypeLabel('unknown'), 'Nhiệm vụ');
});
