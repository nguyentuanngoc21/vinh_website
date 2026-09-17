import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

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
  const field = searchParams.get("field");
  const value = (searchParams.get("value") ?? "").trim();

  if (field !== "username" && field !== "email") {
    return NextResponse.json({ error: "field không hợp lệ." }, { status: 400 });
  }
  if (!value) {
    return NextResponse.json({ available: true });
  }

  const admin = createServiceRoleClient();

  if (field === "username") {
    const { data } = await admin.from("profiles").select("id").eq("username", value).maybeSingle();
    return NextResponse.json({ available: !data });
  }

  const { data: isRegistered, error } = await admin.rpc("is_email_registered", { p_email: value });
  if (error) {
    console.error("[check-availability] is_email_registered failed:", error);
    return NextResponse.json({ error: "Không thể kiểm tra lúc này." }, { status: 500 });
  }
  return NextResponse.json({ available: !isRegistered });
}
