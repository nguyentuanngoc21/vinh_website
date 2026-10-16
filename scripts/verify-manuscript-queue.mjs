// No successful enqueue/claim/finish calls: this preflight never changes jobs.
// node --env-file=.env.prod scripts/verify-manuscript-queue.mjs
const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!origin || !secret || !publicKey) throw new Error('Missing Supabase configuration');
async function call(key, path, body) {
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  const result = await fetch(new URL(path, origin), {
    headers, method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000), redirect: 'error',
  });
  return { status: result.status, data: await result.json().catch(() => null) };
}
const table = await call(secret, '/rest/v1/manuscript_import_jobs?select=id&limit=0');
const bucket = await call(secret, '/storage/v1/bucket/manuscript-imports');
const invalid = { p_id: null, p_owner: null };
const reserve = await call(secret, '/rest/v1/rpc/reserve_manuscript_import', invalid);
const finish = await call(secret, '/rest/v1/rpc/finish_manuscript_import', { p_id: null, p_token: null, p_outcome: 'invalid-preflight' });
const anon = await call(publicKey, '/rest/v1/rpc/reserve_manuscript_import', invalid);
const checks = { tableExists: table.status === 200,
  bucketPrivate: bucket.status === 200 && bucket.data?.public === false && bucket.data?.file_size_limit === 4194304,
  reserveGuard: reserve.data?.message === 'Invalid import identity', finishGuard: finish.data?.message === 'Invalid outcome',
  anonymousDenied: [401,403].includes(anon.status) && anon.data?.code === '42501' };
console.log(JSON.stringify({ project: new URL(origin).host, ...checks, ready: Object.values(checks).every(Boolean),
  note: 'Does not test storage upload, cron, claim concurrency or result lifecycle.' }, null, 2));
if (!Object.values(checks).every(Boolean)) process.exitCode = 1;
