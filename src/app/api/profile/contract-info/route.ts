import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { PLATFORM_FIXED_INFO } from "@/lib/legal/contract-parties";
import { resolveAuthorContractInfo } from "@/lib/legal/contract-info-service";

/**
 * GET /api/profile/contract-info — toàn bộ field "BÊN A" (tác giả đang
 * gọi) VÀ "BÊN B" (Vịnh Câu Chuyện) cần để tự điền Hợp đồng khai thác tác
 * phẩm độc quyền (docs/Hợp đồng khai thác tác phẩm độc quyền - UTD
 * 29082026.docx, xem src/lib/legal/registry.ts id 'chinh-sach-doc-quyen')
 * khi mở popup xem/xác nhận hợp đồng.
 *
 * Route RIÊNG với GET /api/profile/me và GET /api/profile/identity vì trả
 * SỐ CCCD ĐẦY ĐỦ (không mask) cho Bên A — chấp nhận được vì đây luôn là
 * chủ tài khoản tự xem lại thông tin CHÍNH MÌNH (getAuthedUserId chỉ
 * resolve ra đúng user đang đăng nhập) để điền hợp đồng, khác các route
 * kia vốn phục vụ hiển thị chung nên mask theo tinh thần "không
 * over-select dữ liệu nhạy cảm" trong schema.sql.
 */
export async function GET() {
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [authorInfo, { data: platformAdmin }] = await Promise.all([
    resolveAuthorContractInfo(supabase, userId),
    // Bên B = hồ sơ super_admin (đứng tên cá nhân) — xem
    // contract-parties.ts. Lấy hàng CŨ NHẤT nếu lỡ có nhiều super_admin,
    // để ổn định (không đổi Bên B ngẫu nhiên giữa các lần gọi).
    supabase
      .from("profiles")
      .select("id, real_name, phone, address")
      .eq("role", "super_admin")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!authorInfo) {
    return NextResponse.json({ error: "Không tìm thấy hồ sơ." }, { status: 404 });
  }

  const platformCccd = platformAdmin
    ? (
        await supabase
          .from("identity_verifications")
          .select("cccd_number")
          .eq("user_id", platformAdmin.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      ).data?.cccd_number ?? null
    : null;

  return NextResponse.json({
    ...authorInfo,
    platformParty: {
      name: platformAdmin?.real_name ?? null,
      idNumber: platformCccd,
      address: platformAdmin?.address ?? null,
      phone: platformAdmin?.phone ?? null,
      email: PLATFORM_FIXED_INFO.email,
      website: PLATFORM_FIXED_INFO.website,
    },
  });
}
