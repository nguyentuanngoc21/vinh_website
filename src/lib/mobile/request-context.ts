import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAuthedUserId } from '@/lib/wallet/session';

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
/** Settings for the Supabase project the mobile app signs in to (may differ from the local web DB). */
function mobileProject() {
  const url = process.env.MOBILE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.MOBILE_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Mobile server not configured');
  return { url, key, anon: () => createClient<Database>(url, key, noSession) };
}
// Created only when needed (after a token is verified, or for registration) — never up front.
function mobileAdmin(url: string) {
  // Never pair a mobile user's identity with an unrelated development database.
  const serviceKey = process.env.MOBILE_SUPABASE_SERVICE_ROLE_KEY ||
    (url === process.env.NEXT_PUBLIC_SUPABASE_URL ? process.env.SUPABASE_SERVICE_ROLE_KEY : undefined);
  if (!serviceKey) throw new Error('Mobile server not configured');
  return createClient<Database>(url, serviceKey, noSession);
}
/** Both clients for pre-sign-in flows (registration); callers must rate-limit. */
export function getMobileClients() {
  const project = mobileProject();
  return { anon: project.anon(), admin: mobileAdmin(project.url) };
}

// A supplied Authorization header must never fall back to a web cookie.
export async function getRequestContext(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!authorization) {
    const client = createServiceRoleClient();
    return { client, userId: await getAuthedUserId(client) };
  }
  const match = /^Bearer (\S+)$/i.exec(authorization);
  if (!match) throw new Error('Unauthorized');
  const project = mobileProject();
  const { data, error } = await project.anon().auth.getUser(match[1]);
  if (error || !data.user) throw new Error('Unauthorized');
  return { client: mobileAdmin(project.url), userId: data.user.id };
}

export function requestError(error: unknown) {
  const unauthorized = error instanceof Error && error.message === 'Unauthorized';
  return Response.json({ error: unauthorized ? 'Vui lòng đăng nhập lại.' : 'Máy chủ chưa sẵn sàng. Vui lòng thử lại.' },
    { status: unauthorized ? 401 : 503, headers: { 'Cache-Control': 'private, no-store' } });
}

/**
 * Client for PUBLIC reads from the app (home, search, rankings): the publishable key plus the
 * caller's Bearer token when present, so Postgres RLS applies exactly as for the web's
 * createClient() (e.g. deleted books stay hidden) — unlike the service-role client, which
 * bypasses RLS. `userId` is set only when the token verifies.
 */
export async function getReadContext(request: Request) {
  const authorization = request.headers.get('authorization');
  const match = authorization ? /^Bearer (\S+)$/i.exec(authorization) : null;
  if (authorization && !match) throw new Error('Unauthorized');
  const project = mobileProject();
  const client = createClient<Database>(project.url, project.key, {
    ...noSession, global: { headers: match ? { Authorization: `Bearer ${match[1]}` } : {} },
  });
  if (!match) return { client, userId: null };
  const { data, error } = await client.auth.getUser(match[1]);
  if (error || !data.user) throw new Error('Unauthorized');
  return { client, userId: data.user.id };
}

