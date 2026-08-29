import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { AGREEMENTS } from "@/lib/legal/registry";

/**
 * GET /api/profile/agreements — danh sách văn bản thật (Điều khoản, Bảo
 * mật, Chính sách độc quyền...) cho tab "Cam kết & Thỏa thuận" (/ca-nhan),
 * kèm trạng thái xác nhận của người dùng hiện tại cho từng văn bản.
 *
 * "accepted" chỉ true khi accepted_version KHỚP updatedAt hiện tại của văn
 * bản — nếu văn bản vừa được cập nhật nội dung (registry.ts đổi
 * updatedAt), 1 xác nhận cũ tự động rơi về "chưa xác nhận"
 * (updatedSincePending) mà không cần dọn dữ liệu nào ở DB.
 */
export async function GET() {
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("agreement_acceptances")
    .select("agreement_id, accepted_at, accepted_version")
    .eq("user_id", userId);
  if (error) {
    console.error("[profile/agreements] fetch failed:", error);
    return NextResponse.json({ error: "Không tải được danh sách thỏa thuận." }, { status: 500 });
  }

  const byId = new Map(data.map((row) => [row.agreement_id, row]));

  return NextResponse.json({
    agreements: AGREEMENTS.map((a) => {
      const rec = byId.get(a.id);
      const accepted = !!rec && rec.accepted_version === a.updatedAt;
      // Đã có lần xác nhận trước đó, nhưng lệch version -> văn bản vừa cập
      // nhật sau lần xác nhận đó, khác với "chưa từng xác nhận bao giờ".
      const updatedSincePending = !!rec && !accepted;
      return {
        id: a.id,
        name: a.name,
        desc: a.desc,
        updatedAt: a.updatedAt,
        requiredForFeature: a.requiredForFeature ?? null,
        accepted,
        updatedSincePending,
        acceptedAt: accepted ? rec!.accepted_at : null,
      };
    }),
  });
}
