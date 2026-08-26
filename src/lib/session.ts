import type { Session } from "@/lib/auth";

/**
 * Signed, httpOnly session cookie.
 *
 * Why this exists: the app previously only kept the session in
 * localStorage/sessionStorage (see role.tsx). That's fine for client-side
 * UI state, but middleware.ts (which runs on the server, before any page
 * renders) can't read localStorage — so /admin had no server-side gate at
 * all; anyone who knew the URL could open it.
 *
 * This module gives the API routes a way to also hand back a tamper-proof
 * cookie that middleware.ts CAN read. It's a plain HMAC-signed payload
 * (not JWT) built on Web Crypto so the exact same code runs in both the
 * Node.js and Edge middleware runtimes with zero extra dependencies.
 *
 * Once you wire real auth (Supabase, etc.), you have two reasonable
 * options — pick one and delete the other's plumbing:
 *   (a) Keep this hand-rolled cookie (call setSessionCookie() after your
 *       real login check succeeds), or
 *   (b) Switch to Supabase's own SSR cookie session (@supabase/ssr) and
 *       have middleware.ts read the role out of that instead — see
 *       docs/SUPABASE_SETUP.md for the equivalent middleware.
 */

export const SESSION_COOKIE = "vinh_session";

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // Fail loudly in dev rather than silently signing with a guessable
    // default — a missing secret means every "signature" would be the
    // same for everyone, which defeats the point.
    throw new Error(
      "SESSION_SECRET is not set. Add it to .env.local (see .env.example)."
    );
  }
  return secret;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    value.length + ((4 - (value.length % 4)) % 4),
    "="
  );
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
}

async function hmacKey(): Promise<CryptoKey> {
  const keyData = new TextEncoder().encode(getSecret());
  return crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

/** Encodes `{ session, expiresAt }` as `<payload>.<signature>`, both base64url. */
export async function encodeSession(session: Session, maxAgeSeconds: number): Promise<string> {
  const payload = JSON.stringify({ session, expiresAt: Date.now() + maxAgeSeconds * 1000 });
  const payloadB64 = toBase64Url(new TextEncoder().encode(payload));
  const key = await hmacKey();
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${toBase64Url(new Uint8Array(signature))}`;
}

/** Verifies signature + expiry, returns the session or null if invalid/expired/tampered. */
export async function decodeSession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  const [payloadB64, sigB64] = token.split(".");
  if (!payloadB64 || !sigB64) return null;

  try {
    const key = await hmacKey();
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(sigB64),
      new TextEncoder().encode(payloadB64)
    );
    if (!valid) return null;

    const { session, expiresAt } = JSON.parse(
      new TextDecoder().decode(fromBase64Url(payloadB64))
    ) as { session: Session; expiresAt: number };

    if (Date.now() > expiresAt) return null;
    return session;
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE_REMEMBER = 60 * 60 * 24 * 30; // 30 days
export const SESSION_MAX_AGE_TAB = 60 * 60 * 12; // 12 hours, mirrors sessionStorage intent

/**
 * Attaches the signed session cookie to a response. Call this from the
 * login/register route handlers once the real credential check passes:
 *
 *   const session: Session = { email, name, handle, role };
 *   return setSessionCookie(NextResponse.json(session), session, remember);
 */
export async function setSessionCookie(
  response: import("next/server").NextResponse,
  session: Session,
  remember: boolean
) {
  const maxAge = remember ? SESSION_MAX_AGE_REMEMBER : SESSION_MAX_AGE_TAB;
  response.cookies.set(SESSION_COOKIE, await encodeSession(session, maxAge), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  return response;
}

/** Clears the session cookie — call from /api/auth/logout. */
export function clearSessionCookie(response: import("next/server").NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}

/**
 * Server Component / layout guard — the second half of the defense-in-depth
 * pair described in proxy.ts. Proxy's cookie check is "optimistic" (fast,
 * no DB hit); call this from the actual protected layout so a forged,
 * stale, or edge-cache-served cookie can't slip a non-admin into /admin.
 * Usage in an async Server Component: `const session = await requireAdmin();`
 * — redirects to /dang-nhap itself, so callers can treat the return value
 * as a guaranteed admin Session.
 */
export async function requireAdmin(): Promise<Session> {
  const { cookies } = await import("next/headers");
  const { redirect } = await import("next/navigation");
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await decodeSession(token);
  // super_admin có mọi quyền của admin CỘNG THÊM — cùng lý do sửa ở
  // src/proxy.ts, khớp getAuthedAdminId() (src/lib/wallet/session.ts).
  if (!session || (session.role !== "admin" && session.role !== "super_admin")) {
    redirect("/dang-nhap");
    throw new Error("unreachable"); // `redirect()` throws; this satisfies TS's control-flow analysis
  }
  return session;
}
