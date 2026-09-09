import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveRedirectTarget } from "@/lib/redirect-target";

/**
 * "Gửi lại mã" cho màn xác nhận OTP (/api/auth/verify-otp) — dùng khi mã 6
 * số trong email cũ đã hết hạn/nhập sai quá nhiều lần, không cần người
 * dùng thoát ra điền lại cả form đăng ký hoặc email quên mật khẩu.
 *
 * type="recovery" không đi qua supabase.auth.resend() — GoTrue chỉ hỗ trợ
 * resend() cho "signup"/"email_change"/"sms"/"phone_change", không có
 * "recovery". Gửi lại mail đặt lại mật khẩu vẫn là gọi lại
 * resetPasswordForEmail() (giống /api/auth/forgot-password), nên nhánh đó
 * luôn trả `{ ok: true }` chung, không phân biệt email có tồn tại hay
 * không — cùng lý do chống dò email của route kia.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const type = body?.type === "recovery" ? "recovery" : "signup";

  if (!email) {
    return NextResponse.json({ error: "Vui lòng nhập email." }, { status: 400 });
  }

  const supabase = await createClient();
  const origin = new URL(request.url).origin;

  if (type === "recovery") {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/api/auth/confirm?next=${encodeURIComponent("/dat-lai-mat-khau")}`,
    });
    if (error) console.error("[resend-otp] resetPasswordForEmail failed:", error);
    return NextResponse.json({ ok: true });
  }

  // Ngược lại với nhánh recovery: đây là email người dùng vừa tự gõ ở bước
  // đăng ký ngay trước đó (đã biết tài khoản này tồn tại), nên không cần
  // che giấu lỗi — trả thẳng message của Supabase để họ biết vì sao gửi
  // lại thất bại (ví dụ rate limit).
  // `next` giữ nguyên giá trị từ lần signUp() ban đầu (register-form.tsx
  // gửi lại đúng searchParams.get("next") của chính nó) — gửi lại mail
  // không được làm rơi mất trang cần quay lại đã chọn từ đầu.
  const next = resolveRedirectTarget(typeof body?.next === "string" ? body.next : null);
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: `${origin}/api/auth/confirm?next=${encodeURIComponent(next)}&flow=signup`,
    },
  });
  if (error) {
    console.error("[resend-otp] resend failed:", error);
    return NextResponse.json({ error: error.message ?? "Gửi lại mã thất bại." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
