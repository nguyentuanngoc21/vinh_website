import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { setSessionCookie } from "@/lib/session";
import type { Session } from "@/lib/auth";

/**
 * Step 3 of the reset flow: /dat-lai-mat-khau submits the new password here.
 *
 * Relies on the recovery session /api/auth/confirm already put in the sb-*
 * cookies — `createClient()` reads those automatically, so there's no token
 * in the request body, only the new password. If that cookie is missing or
 * expired, `updateUser` fails with "Auth session missing" and the user is
 * told to request a new link rather than silently doing nothing.
 *
 * On success this also (re)issues our own `vinh_session` cookie — same as
 * /api/auth/login — so the user lands back on the site fully signed in
 * instead of having to log in again right after resetting their password.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Mật khẩu phải có ít nhất 8 ký tự." },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data: userData, error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError || !userData.user) {
    // Logged, not surfaced verbatim: Supabase's message here can differ a
    // lot (missing session, weak/leaked password, rate limit, etc.) and
    // the generic copy below covers the common "link expired" case, but
    // check this log first when debugging a report of "reset button
    // errors" — don't assume expiry without confirming it here.
    console.error("[reset-password] updateUser failed:", updateError);
    return NextResponse.json(
      {
        error:
          updateError?.message ??
          "Liên kết đặt lại mật khẩu đã hết hạn hoặc không hợp lệ. Vui lòng yêu cầu gửi lại.",
      },
      { status: 401 }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, nickname, role")
    .eq("id", userData.user.id)
    .single();

  const session: Session = {
    email: userData.user.email!,
    name: profile?.nickname ?? "",
    handle: profile?.username ?? "",
    role: profile?.role ?? "user",
  };

  return setSessionCookie(NextResponse.json(session), session, true);
}
