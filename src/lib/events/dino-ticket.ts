import { createHmac, randomUUID } from 'node:crypto';

export const TICKET_TTL_SECONDS = 60;
export type DinoRole = 'user' | 'admin' | 'super_admin';

function configuredUrl(value: string | undefined): URL {
  if (!value) throw new Error('Dino configuration missing');
  const url = new URL(value);
  const local = process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.hash) throw new Error('Invalid Dino URL');
  return url;
}

export function getDinoConfig() {
  const game = configuredUrl(process.env.DINO_GAME_URL);
  const web = configuredUrl(process.env.DINO_WEB_ORIGIN);
  const secret = process.env.DINO_GAME_TICKET_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32 || game.origin === web.origin || web.href !== `${web.origin}/`) throw new Error('Invalid Dino configuration');
  return { gameUrl: game.href, gameOrigin: game.origin, issuer: web.origin, secret };
}

export function issueDinoTicket(input: { userId: string; eventId: string; name: string; role: DinoRole; nonce: string }, config: ReturnType<typeof getDinoConfig>, now = Math.floor(Date.now() / 1000)) {
  const claims = {
    v: 1, iss: config.issuer, aud: config.gameOrigin, sub: input.userId,
    eventId: input.eventId, name: input.name.slice(0, 64), role: input.role,
    canHost: input.role === 'admin' || input.role === 'super_admin', nonce: input.nonce,
    iat: now, exp: now + TICKET_TTL_SECONDS, jti: randomUUID(),
  };
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = createHmac('sha256', config.secret).update(`${header}.${payload}`).digest('base64url');
  return { ticket: `${header}.${payload}.${signature}`, expiresAt: claims.exp * 1000 };
}
