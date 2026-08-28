import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { setSessionCookie } from "@/lib/session";
import type { Session } from "@/lib/auth";

/**
 * Alternative to /api/auth/confirm's link-based PKCE exchange: verifies the
 * 6-digit `{{ .Token }}` code Supabase also embeds in the same "Confirm
 * signup" / "Reset Password" emails (see docs/supabase/email-templates/).
 *
 * Why this exists: the PKCE link only works if it's opened in the SAME
 * browser that started the signup/reset request — `exchangeCodeForSession`
 * needs a `code_verifier` cookie that browser stored. On mobile, tapping the
 * link from the Gmail/Outlook app often opens a DIFFERENT browser (no access
 * to that cookie), so the link always fails with "hết hạn hoặc không hợp
 * lệ" even on a fresh email. `verifyOtp` is a separate GoTrue endpoint that
 * checks the code/email pair directly — no code_verifier, no browser
 * dependency — so it works from any device the user can read the email on.
 *
 * Both the link and the code point at the same underlying one-time secret;
 * whichever the user completes first consumes it. This route is purely
 * additive — /api/auth/confirm is untouched and still works for the
 * happy-path click-in-the-same-browser case.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const type = body?.type === "recovery" ? "recovery" : "signup";

  if (!email || !token) {
    return NextResponse.json({ error: "Vui lòng nhập email và mã xác nhận." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type });

  if (error || !data.user) {
    console.error("[verify-otp] verifyOtp failed:", error);
    return NextResponse.json(
      { error: "Mã xác nhận không đúng hoặc đã hết hạn. Vui lòng kiểm tra lại hoặc gửi lại mã." },
      { status: 400 }
    );
  }

  // Luồng quên mật khẩu: chỉ cần dựng session phục hồi (cookie sb-*, vừa
  // được createClient() ghi lại) — /dat-lai-mat-khau tự nhận ra session này
  // giống hệt khi đến từ link email; /api/auth/reset-password mới thực sự
  // đổi mật khẩu + set vinh_session (xem route đó), không lặp lại ở đây.
  if (type === "recovery") {
    return NextResponse.json({ ok: true });
  }

  // Luồng đăng ký: giống nhánh flow=signup của /api/auth/confirm — profiles
  // đã được register/route.ts tạo sẵn bằng service-role client lúc
  // signUp(), nên chỉ cần đọc lại rồi đăng nhập thật (set vinh_session).
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

  return setSessionCookie(NextResponse.json(session), session, true);
}
