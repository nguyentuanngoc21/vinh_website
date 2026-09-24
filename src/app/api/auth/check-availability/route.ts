import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { checkSignupAvailability } from "@/lib/registration";

/**
 * Real-time "đã dùng chưa" check cho form đăng ký (register-form.tsx), gọi
 * on-blur/debounced khi người dùng rời khỏi ô username hoặc email — KHÔNG
 * đợi tới lúc bấm "Tạo tài khoản" mới báo trùng.
 *
 * Chỉ 2 field này — KHÔNG có "cccd" ở đây. Số CCCD là dữ liệu cá nhân nhạy
 * cảm (Nghị định 13/2023/NĐ-CP); một endpoint công khai cho biết "số CCCD
 * X đã có ai đăng ký chưa" là một oracle dò thông tin cá nhân theo CCCD cụ
 * thể. CCCD trùng chỉ được kiểm tra ở server lúc submit thật (xem
 * src/app/api/auth/register/route.ts), có rate-limit, không lộ qua endpoint
 * real-time này.
 */
export async function GET(request: Request) {
  const ip = getClientIp(request);
  if (!checkRateLimit(`check-availability:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: "Bạn thao tác quá nhanh, vui lòng thử lại sau." }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  return checkSignupAvailability(createServiceRoleClient(), searchParams.get("field"), searchParams.get("value"));
}
