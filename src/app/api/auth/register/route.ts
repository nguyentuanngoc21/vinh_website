import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { registerAccount } from "@/lib/registration";

export async function POST(request: Request) {
  // Đăng ký là request tốn (OCR CCCD, upload ảnh) và giờ còn là nơi DUY
  // NHẤT biết được 1 số CCCD đã dùng để đăng ký chưa (real-time check ở
  // check-availability/route.ts cố tình KHÔNG lộ CCCD — xem comment ở đó).
  // Giới hạn số lần thử/IP để việc đó không trở thành cách dò CCCD hàng loạt.
  const ip = getClientIp(request);
  if (!checkRateLimit(`register:${ip}`, 10, 10 * 60_000)) {
    return NextResponse.json(
      { error: "Bạn đã thử đăng ký quá nhiều lần. Vui lòng thử lại sau ít phút." },
      { status: 429 }
    );
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
  }

  // SSR client (createClient) cho signUp — lưu code_verifier PKCE vào cookie
  // để link xác nhận trong mail đổi được code ở /api/auth/confirm. Toàn bộ
  // nghiệp vụ còn lại nằm ở registerAccount(), dùng chung với mobile.
  return registerAccount(form, {
    authClient: await createClient(),
    admin: createServiceRoleClient(),
    origin: new URL(request.url).origin,
  });
}
