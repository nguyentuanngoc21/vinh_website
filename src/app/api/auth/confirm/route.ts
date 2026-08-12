import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { setSessionCookie } from "@/lib/session";
import type { Session } from "@/lib/auth";

/**
 * Shared callback for every Supabase email link that carries a one-time
 * `?code=...` (PKCE) — currently: "reset password" (forgot-password/route.ts,
 * next=/dat-lai-mat-khau) and "confirm signup" (register/route.ts, next=/,
 * flow=signup). Both need the code exchanged for a Supabase session first;
 * `flow=signup` additionally means: this is the FIRST moment the account is
 * actually usable, so also mint our own `vinh_session` cookie here (register
 * deliberately doesn't — see that route) before landing on `next`.
 *
 * This has to be a server route, not a client page, because exchanging the
 * code for a session is what sets the sb-* auth cookies via
 * `createClient()`'s `setAll` (see src/lib/supabase/server.ts) — a plain
 * page component can only read cookies, not write them ahead of its own
 * render. Once exchanged, the target page loads with a real Supabase session
 * already in place (needed by /dat-lai-mat-khau, which calls
 * supabase.auth.updateUser()).
 *
 * `next` is carried through unencoded from our own redirectTo (see
 * forgot-password/route.ts and register/route.ts) — never taken from
 * arbitrary user input in a way that could redirect off-site. Defaults to
 * /dat-lai-mat-khau only because that was this route's original (and still
 * most common) caller; every caller should keep passing `next` explicitly.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/dat-lai-mat-khau";
  const isSignupFlow = url.searchParams.get("flow") === "signup";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      if (!isSignupFlow) {
        return NextResponse.redirect(new URL(next, url.origin));
      }

      // Cùng cách login/reset-password/route.ts dựng Session — profiles đã
      // được register/route.ts tạo sẵn bằng service-role client lúc
      // signUp(), nên chỉ cần đọc lại, không insert gì ở đây.
      const { data: profile } = await supabase
        .from("profiles")
        .select("username, nickname, role")
        .eq("id", data.user.id)
        .single();

      const session: Session = {
        email: data.user.email!,
        name: profile?.nickname ?? "",
        handle: profile?.username ?? "",
        role: profile?.role ?? "user",
      };

      return setSessionCookie(NextResponse.redirect(new URL(next, url.origin)), session, true);
    }
    console.error("[auth/confirm] exchangeCodeForSession failed:", error);
  }

  // Missing/invalid/expired code — send back to the right request form
  // (đúng luồng đang chạy) với 1 flag để trang đó hiện thông báo giải
  // thích, thay vì landing im lặng trên 1 form không có session.
  const fallback = isSignupFlow ? "/dang-ky" : "/quen-mat-khau";
  return NextResponse.redirect(new URL(`${fallback}?error=link-het-han`, url.origin));
}
