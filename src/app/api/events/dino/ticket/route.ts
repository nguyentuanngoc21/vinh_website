import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { consumeRateLimits } from '@/lib/rate-limit';
import { getDinoConfig, issueDinoTicket, type DinoRole } from '@/lib/events/dino-ticket';

export const runtime = 'nodejs';
const UUID = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;

// Vịnh only issues identity tickets. Rooms and gameplay belong to the game service.
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
  const reply = (data: unknown, status = 200, extra = {}) => NextResponse.json(data, { status, headers: { ...headers, ...extra } });
  let config: ReturnType<typeof getDinoConfig>;
  try { config = getDinoConfig(); } catch { return reply({ error: 'Dino Run chưa được cấu hình.' }, 503); }
  if (request.headers.get('origin') !== config.issuer) return reply({ error: 'Nguồn yêu cầu không hợp lệ.' }, 403);
  const body = await request.json().catch(() => null);
  if (!body || typeof body.eventId !== 'string' || !UUID.test(body.eventId) || typeof body.nonce !== 'string' || !UUID.test(body.nonce)) return reply({ error: 'Yêu cầu mở game không hợp lệ.' }, 400);
  try {
    const client = await createClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return reply({ error: 'Vui lòng đăng nhập trên Vịnh trước khi mở game.' }, 401);
    const limited = consumeRateLimits([{ key: `dino-ticket:${user.id}`, limit: 10, windowMs: 60_000 }]);
    if (!limited.ok) return reply({ error: 'Bạn mở game quá nhanh. Vui lòng thử lại sau.' }, 429, { 'Retry-After': String(limited.retryAfterSec) });
    const admin = createServiceRoleClient();
    const [profileResult, eventResult] = await Promise.all([
      admin.from('profiles').select('nickname,username,role').eq('id', user.id).maybeSingle(),
      admin.from('community_events').select('status,hidden,games').eq('id', body.eventId).maybeSingle(),
    ]);
    if (profileResult.error || eventResult.error) return reply({ error: 'Chưa thể mở Dino Run. Vui lòng thử lại.' }, 503);
    const profile = profileResult.data, event = eventResult.data;
    if (!profile) return reply({ error: 'Không tải được quyền tài khoản.' }, 403);
    if (!event || event.status !== 'published' || event.hidden || !event.games.some(game => game.id === 'dino-run')) return reply({ error: 'Dino Run chưa mở trong sự kiện này.' }, 403);
    if (!['user', 'admin', 'super_admin'].includes(profile.role)) return reply({ error: 'Quyền tài khoản không hợp lệ.' }, 403);
    const signed = issueDinoTicket({ userId: user.id, eventId: body.eventId.toLowerCase(), name: profile.nickname || profile.username || 'Người chơi', role: profile.role as DinoRole, nonce: body.nonce }, config);
    return reply({ ...signed, gameUrl: config.gameUrl, gameOrigin: config.gameOrigin, nonce: body.nonce, protocol: 1 });
  } catch {
    return reply({ error: 'Chưa thể mở Dino Run. Vui lòng thử lại.' }, 503);
  }
}
