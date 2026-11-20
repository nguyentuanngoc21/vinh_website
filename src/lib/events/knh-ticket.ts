import { createHmac, randomUUID } from 'node:crypto';

export const TICKET_TTL_SECONDS = 60;
export type KnhRole = 'user' | 'admin' | 'super_admin';

function configuredUrl(value: string | undefined): URL {
  if (!value) throw new Error('Knh configuration missing');
  const url = new URL(value);
  const local = process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.hash) throw new Error('Invalid Knh URL');
  return url;
}

export function getKnhConfig() {
  const game = configuredUrl(process.env.KNH_GAME_URL);
  const web = configuredUrl(process.env.KNH_WEB_ORIGIN);
  const secret = process.env.KNH_GAME_TICKET_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32 || game.origin === web.origin || web.href !== `${web.origin}/`) throw new Error('Invalid Knh configuration');
  game.searchParams.set('event', '1');
  return { gameUrl: game.href, gameOrigin: game.origin, issuer: web.origin, secret };
}

export function issueKnhTicket(input: { userId: string; eventId: string; name: string; role: KnhRole; nonce: string; guest?: boolean }, config: ReturnType<typeof getKnhConfig>, now = Math.floor(Date.now() / 1000)) {
  const claims = {
    v: 1, gameId: 'ky-nhan-hoi', guest: input.guest === true, iss: config.issuer, aud: config.gameOrigin, sub: input.userId,
    eventId: input.eventId, name: input.name.slice(0, 64), role: input.role,
    canHost: input.role === 'admin' || input.role === 'super_admin', nonce: input.nonce,
    iat: now, exp: now + TICKET_TTL_SECONDS, jti: randomUUID(),
  };
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = createHmac('sha256', config.secret).update(`${header}.${payload}`).digest('base64url');
  return { ticket: `${header}.${payload}.${signature}`, expiresAt: claims.exp * 1000 };
}
