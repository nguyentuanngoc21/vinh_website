import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
const mocks = vi.hoisted(() => ({ user: vi.fn(), profile: vi.fn(), event: vi.fn(), limit: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.user } }),
  createServiceRoleClient: () => ({ from: (table: string) => ({ select: () => ({ eq: () => ({ maybeSingle: table === 'profiles' ? mocks.profile : mocks.event }) }) }) }),
}));
vi.mock('@/lib/rate-limit', () => ({ consumeRateLimits: mocks.limit }));
import { POST } from './route';
const eventId = '71000000-0000-4000-8000-000000000001';
const userId = '71000000-0000-4000-8000-000000000002';
const nonce = '71000000-0000-4000-8000-000000000003';
const call = (extra: Record<string, unknown> = {}, origin = 'https://vinh.example') => POST(new Request('https://vinh.example/api/events/dino/ticket', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId, nonce, ...extra }) }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('DINO_GAME_URL', 'https://dino.example/play/'); vi.stubEnv('DINO_WEB_ORIGIN', 'https://vinh.example'); vi.stubEnv('DINO_GAME_TICKET_SECRET', 'test-secret-with-at-least-thirty-two-bytes');
  mocks.user.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  mocks.profile.mockResolvedValue({ data: { nickname: 'Tên', username: 'test', role: 'user' }, error: null });
  mocks.event.mockResolvedValue({ data: { status: 'published', hidden: false, games: [{ id: 'dino-run' }] }, error: null });
  mocks.limit.mockReturnValue({ ok: true });
});
describe('Dino ticket issuer', () => {
  it('rejects missing deployment configuration', async () => { vi.stubEnv('DINO_GAME_TICKET_SECRET',''); expect((await call()).status).toBe(503); expect(mocks.user).not.toHaveBeenCalled(); });
  it('rejects insecure or same-origin game deployments', async () => {
    for (const url of ['http://dino.example','https://vinh.example/game','https://u:pw@dino.example']) { vi.stubEnv('DINO_GAME_URL',url); expect((await call()).status).toBe(503); }
  });
  it('rejects a foreign origin before authentication', async () => { expect((await call({},'https://evil.example')).status).toBe(403); expect(mocks.user).not.toHaveBeenCalled(); });
  it('requires a verified login', async () => { mocks.user.mockResolvedValue({ data:{user:null} }); expect((await call()).status).toBe(401); expect(mocks.profile).not.toHaveBeenCalled(); });
  it('validates event and handshake nonce', async () => { expect((await call({nonce:'bad'})).status).toBe(400); expect((await call({eventId:'bad'})).status).toBe(400); expect(mocks.user).not.toHaveBeenCalled(); });
  it('requires a published visible event with Dino registered', async () => {
    for (const event of [null,{status:'draft',hidden:false,games:[{id:'dino-run'}]},{status:'published',hidden:true,games:[{id:'dino-run'}]},{status:'published',hidden:false,games:[]}]) {
      mocks.event.mockResolvedValue({data:event,error:null}); expect((await call()).status).toBe(403);
    }
  });
  it('binds role and identity to server profile, signs a 60-second audience-bound ticket', async () => {
    const res = await call({role:'admin',userId:'victim'}); expect(res.status).toBe(200); const data = await res.json();
    const [header,payload,signature] = data.ticket.split('.');
    expect(signature).toBe(createHmac('sha256',process.env.DINO_GAME_TICKET_SECRET!).update(`${header}.${payload}`).digest('base64url'));
    const claims = JSON.parse(Buffer.from(payload,'base64url').toString());
    expect(claims).toMatchObject({iss:'https://vinh.example',aud:'https://dino.example',sub:userId,eventId,nonce,role:'user',canHost:false});
    expect(claims.exp-claims.iat).toBe(60); expect(res.headers.get('Cache-Control')).toBe('private, no-store'); expect(res.headers.get('Vary')).toBe('Cookie');
  });
  it('permits both admin roles to host', async () => { for (const role of ['admin','super_admin']) { mocks.profile.mockResolvedValue({data:{role,nickname:'Admin'},error:null}); const data = await (await call()).json(); expect(JSON.parse(Buffer.from(data.ticket.split('.')[1],'base64url').toString()).canHost).toBe(true); } });
  it('rate limits ticket creation before database reads', async () => { mocks.limit.mockReturnValue({ok:false,retryAfterSec:12}); const res = await call(); expect(res.status).toBe(429); expect(res.headers.get('Retry-After')).toBe('12'); expect(mocks.profile).not.toHaveBeenCalled(); });
  it('does not expose internal errors', async () => { mocks.event.mockRejectedValue(new Error('secret DB error')); const res = await call(); expect(res.status).toBe(503); expect(await res.text()).not.toContain('secret'); });
});
