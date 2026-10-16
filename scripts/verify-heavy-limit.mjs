// Read-only preflight. The RPC receives invalid parameters and must reject BEFORE writing.
// Run: node --env-file=.env.prod scripts/verify-heavy-limit.mjs
const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!origin || !adminKey || !publicKey) throw new Error('Missing Supabase environment configuration');
const url = new URL(origin);
if (url.protocol !== 'https:') throw new Error('Expected HTTPS Supabase origin');

async function call(key, path, body) {
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  // Legacy JWT keys need Bearer authentication; newer publishable/secret keys use apikey.
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  const response = await fetch(new URL(path, origin), {
    method: body ? 'POST' : 'GET', headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000), redirect: 'error',
  });
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}
const invalid = { p_subject: null, p_scope: 'identity-ocr', p_limit: 5, p_window_seconds: 600 };
const table = await call(adminKey, '/rest/v1/heavy_request_limits?select=scope&limit=0');
const rpc = await call(adminKey, '/rest/v1/rpc/consume_heavy_request_limit', invalid);
const anon = await call(publicKey, '/rest/v1/rpc/consume_heavy_request_limit', invalid);
const ready = table.status === 200 && rpc.data?.message === 'Invalid rate limit parameters' &&
  [401, 403].includes(anon.status) && anon.data?.code === '42501';
console.log(JSON.stringify({ projectHost: url.host, tableStatus: table.status,
  adminRpcRejectsInvalidInput: rpc.data?.message === 'Invalid rate limit parameters',
  anonymousRpcDenied: [401, 403].includes(anon.status) && anon.data?.code === '42501', ready,
  note: 'No rows inserted/updated. Does not test real-user quota, authenticated role or concurrency.' }, null, 2));
if (!ready) process.exitCode = 1;
