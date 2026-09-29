import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { decodeSessionPayload, reissueSessionCookie, SESSION_COOKIE } from "@/lib/session";
import type { Session } from "@/lib/auth";
import { isAdminRole } from "@/lib/roles";

/**
 * GET /api/auth/session — làm mới cookie vinh_session theo profiles.
 *
 * Role (và nickname) trong cookie chỉ mới bằng lần đăng nhập gần nhất, nên
 * khi super_admin đổi role của ai đó (api/admin/users/[userId]), cookie của
 * người đó vẫn giữ role cũ. Route này đọc lại role thật, ký lại cookie
 * (giữ nguyên hạn cũ) — người được đổi role KHÔNG cần đăng nhập lại.
 *
 * 2 chế độ:
 *   - Không có ?next: trả JSON session mới — RoleProvider (lib/role.tsx)
 *     gọi mỗi lần tải trang để đồng bộ role cache phía client (cờ isAdmin).
 *   - Có ?next=/đường-dẫn: làm mới rồi redirect. proxy.ts đưa người có
 *     cookie role 'user' vào đây khi mở /admin (có thể vừa được nâng
 *     quyền); requireAdmin() đưa admin vừa bị hạ quyền vào đây với next=/.
 *     Nếu next là /admin mà role thật vẫn không phải admin → về "/" (không
 *     redirect lại /admin, tránh vòng lặp với proxy).
 */
export async function GET(request: NextRequest) {
  const nextParam = request.nextUrl.searchParams.get("next");
  // Chỉ nhận đường dẫn nội bộ — chặn open redirect (//evil.com, /\evil.com).
  const next = nextParam && /^\/(?![\/\\])/.test(nextParam) ? nextParam : null;

  const payload = await decodeSessionPayload((await cookies()).get(SESSION_COOKIE)?.value);
  if (!payload) {
    if (next) return redirectTo(request, `/dang-nhap?next=${encodeURIComponent(next)}`);
    return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
  }

  const { data: profile } = await createServiceRoleClient()
    .from("profiles")
    .select("nickname, role")
    .eq("username", payload.session.handle)
    .maybeSingle();
  if (!profile) {
    if (next) return redirectTo(request, "/");
    return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
  }

  const fresh: Session = { ...payload.session, name: profile.nickname, role: profile.role };
  const changed = fresh.role !== payload.session.role || fresh.name !== payload.session.name;

  let response: NextResponse;
  if (next) {
    const isAdmin = isAdminRole(fresh.role);
    response = redirectTo(request, next.startsWith("/admin") && !isAdmin ? "/" : next);
  } else {
    response = NextResponse.json(fresh);
  }
  return changed ? reissueSessionCookie(response, fresh, payload.expiresAt) : response;
}

function redirectTo(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, request.nextUrl.origin));
}
