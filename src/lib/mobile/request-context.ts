import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAuthedUserId } from '@/lib/wallet/session';

// A supplied Authorization header must never fall back to a web cookie.
export async function getRequestContext(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!authorization) {
    const client = createServiceRoleClient();
    return { client, userId: await getAuthedUserId(client) };
  }
  const match = /^Bearer (\S+)$/i.exec(authorization);
  if (!match) throw new Error('Unauthorized');
  const url = process.env.MOBILE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.MOBILE_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Mobile server not configured');
  const verifier = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await verifier.auth.getUser(match[1]);
  if (error || !data.user) throw new Error('Unauthorized');
  // Never pair a mobile user's identity with an unrelated development database.
  const serviceKey = process.env.MOBILE_SUPABASE_SERVICE_ROLE_KEY ||
    (url === process.env.NEXT_PUBLIC_SUPABASE_URL ? process.env.SUPABASE_SERVICE_ROLE_KEY : undefined);
  if (!serviceKey) throw new Error('Mobile server not configured');
  const client = createClient<Database>(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return { client, userId: data.user.id };
}

export function requestError(error: unknown) {
  const unauthorized = error instanceof Error && error.message === 'Unauthorized';
  return Response.json({ error: unauthorized ? 'Vui lòng đăng nhập lại.' : 'Máy chủ chưa sẵn sàng. Vui lòng thử lại.' },
    { status: unauthorized ? 401 : 503, headers: { 'Cache-Control': 'private, no-store' } });
}
