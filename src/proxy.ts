import { NextResponse, type NextRequest } from "next/server";
import { decodeSession, SESSION_COOKIE } from "@/lib/session";

/**
 * Server-side route protection by role.
 *
 * Before this file existed, /admin had NO server-side check at all —
 * AdminLayout just rendered for anyone who requested the URL, admin or
 * not. The `isAdmin` flag in role.tsx only ever hid/showed UI in the
 * browser; it never stopped a direct request to /admin from a signed-out
 * client, curl, or a search-engine crawler.
 *
 * This runs before every matched request, on the server, reading the
 * httpOnly cookie set by /api/auth/login (see src/lib/session.ts) — a
 * cookie the client-side JS can't read or forge.
 *
 * Note (Next.js 16): this file conventionally used to be middleware.ts;
 * it's now proxy.ts (same API, renamed — see the Next.js "Proxy" guide).
 * Also per Next's own guidance, Proxy is meant for *optimistic* checks —
 * fast, cookie-only, no DB round-trip — not as the sole authorization
 * boundary. Pair this with a real check in the protected layout/page
 * itself (see requireAdmin() in src/lib/session.ts, used in
 * src/app/admin/layout.tsx) so a forged or stale cookie can't slip
 * through if this file is ever bypassed or misconfigured.
 */

const ADMIN_PREFIX = "/admin";
const AUTHOR_PREFIX = "/author";
const READER_ONLY_PREFIXES = ["/ca-nhan"]; // any logged-in role may enter

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await decodeSession(request.cookies.get(SESSION_COOKIE)?.value);

  const needsAdmin = pathname.startsWith(ADMIN_PREFIX);
  const needsAuthor = pathname.startsWith(AUTHOR_PREFIX);
  const needsAnyLogin =
    needsAuthor || READER_ONLY_PREFIXES.some((p) => pathname.startsWith(p));

  if (needsAdmin && session?.role !== "admin") {
    return redirectToLogin(request);
  }

  if (needsAnyLogin && !session) {
    return redirectToLogin(request);
  }

  return NextResponse.next();
}

function redirectToLogin(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/dang-nhap";
  url.search = `?next=${encodeURIComponent(request.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*", "/author/:path*", "/ca-nhan/:path*"],
};
