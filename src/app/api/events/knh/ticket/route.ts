import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { consumeRateLimits } from '@/lib/rate-limit';
import { getKnhConfig, issueKnhTicket, type KnhRole } from '@/lib/events/knh-ticket';

export const runtime = 'nodejs';
const UUID = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;

// Vịnh only issues identity tickets. Rooms and gameplay belong to the game service.
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
  const reply = (data: unknown, status = 200, extra = {}) => NextResponse.json(data, { status, headers: { ...headers, ...extra } });
  let config: ReturnType<typeof getKnhConfig>;
  try { config = getKnhConfig(); } catch { return reply({ error: 'Kỳ Nhân Hội chưa được cấu hình.' }, 503); }
  if (request.headers.get('origin') !== config.issuer) return reply({ error: 'Nguồn yêu cầu không hợp lệ.' }, 403);
  const body = await request.json().catch(() => null);
  if (!body || typeof body.eventId !== 'string' || !UUID.test(body.eventId) || typeof body.nonce !== 'string' || !UUID.test(body.nonce)) return reply({ error: 'Yêu cầu mở game không hợp lệ.' }, 400);
  try {
    const client = await createClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError && authError.name !== 'AuthSessionMissingError') return reply({ error: 'Chưa xác minh được tài khoản. Vui lòng thử lại.' }, 503);
    const guest = !user;
    const limited = consumeRateLimits([{ key: `knh-ticket:${user?.id ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'guest'}`, limit: 30, windowMs: 60_000 }, { key: 'knh-ticket:global', limit: 600, windowMs: 60_000 }]);
    if (!limited.ok) return reply({ error: 'Bạn mở game quá nhanh. Vui lòng thử lại sau.' }, 429, { 'Retry-After': String(limited.retryAfterSec) });
    const admin = createServiceRoleClient();
    const [profileResult, eventResult] = await Promise.all([
      user ? admin.from('profiles').select('nickname,username,role').eq('id', user.id).maybeSingle() : Promise.resolve({ data: { nickname: 'Khách', username: '', role: 'user' }, error: null }),
      admin.from('community_events').select('status,hidden,games').eq('id', body.eventId).maybeSingle(),
    ]);
    if (profileResult.error || eventResult.error) return reply({ error: 'Chưa thể mở Kỳ Nhân Hội. Vui lòng thử lại.' }, 503);
    const profile = profileResult.data, event = eventResult.data;
    if (!profile) return reply({ error: 'Không tải được quyền tài khoản.' }, 403);
    if (!event || event.status !== 'published' || event.hidden || !event.games.some(game => game.id === 'ky-nhan-hoi')) return reply({ error: 'Kỳ Nhân Hội chưa mở trong sự kiện này.' }, 403);
    if (!['user', 'admin', 'super_admin'].includes(profile.role)) return reply({ error: 'Quyền tài khoản không hợp lệ.' }, 403);
    const signed = issueKnhTicket({ userId: user?.id ?? randomUUID(), guest, eventId: body.eventId.toLowerCase(), name: profile.nickname || profile.username || 'Người chơi', role: profile.role as KnhRole, nonce: body.nonce }, config);
    return reply({ ...signed, gameUrl: config.gameUrl, gameOrigin: config.gameOrigin, nonce: body.nonce, protocol: 1 });
  } catch {
    return reply({ error: 'Chưa thể mở Kỳ Nhân Hội. Vui lòng thử lại.' }, 503);
  }
}
