import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";

/**
 * GET /api/profile/contract-info — toàn bộ field "BÊN A" (tác giả) cần để
 * tự điền Hợp đồng khai thác tác phẩm độc quyền (docs/Hợp đồng khai thác
 * tác phẩm độc quyền - UTD 29082026.docx, xem src/lib/legal/registry.ts id
 * 'chinh-sach-doc-quyen') khi mở popup xem/xác nhận hợp đồng — gộp
 * profiles + identity_verifications + auth.users.email vào 1 response
 * duy nhất thay vì client tự gọi 3 nơi.
 *
 * Route RIÊNG với GET /api/profile/me và GET /api/profile/identity vì trả
 * SỐ CCCD ĐẦY ĐỦ (không mask) — chấp nhận được vì đây luôn là chủ tài
 * khoản tự xem lại thông tin CHÍNH MÌNH (getAuthedUserId chỉ resolve ra
 * đúng user đang đăng nhập) để điền hợp đồng, khác các route kia vốn phục
 * vụ hiển thị chung nên mask theo tinh thần "không over-select dữ liệu
 * nhạy cảm" trong schema.sql.
 */
export async function GET() {
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [{ data: profile, error: profileError }, { data: verification }, { data: userData }] = await Promise.all([
    supabase
      .from("profiles")
      .select("nickname, real_name, phone, date_of_birth, address")
      .eq("id", userId)
      .single(),
    supabase
      .from("identity_verifications")
      .select("cccd_number, cccd_issued_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.auth.admin.getUserById(userId),
  ]);

  if (profileError || !profile) {
    return NextResponse.json({ error: "Không tìm thấy hồ sơ." }, { status: 404 });
  }

  return NextResponse.json({
    penName: profile.nickname,
    realName: profile.real_name,
    dateOfBirth: profile.date_of_birth,
    address: profile.address,
    phone: profile.phone,
    email: userData.user?.email ?? null,
    cccdNumber: verification?.cccd_number ?? null,
    cccdIssuedAt: verification?.cccd_issued_at ?? null,
  });
}
