import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { getAgreement } from "@/lib/legal/registry";

/**
 * POST /api/profile/agreements/:agreementId/accept — ghi nhận việc người
 * dùng hiện tại vừa xác nhận (nút "Xác nhận" ở bảng, hoặc "Tôi đồng ý"
 * trong popup xem văn bản) một thỏa thuận, ở ĐÚNG version hiện tại của nó
 * (registry.ts AGREEMENTS[...].updatedAt) — không nhận version từ client,
 * tránh việc client tự gửi version cũ để "xác nhận khống".
 *
 * upsert theo primary key (user_id, agreement_id): xác nhận lại một văn
 * bản đã từng xác nhận (ví dụ sau khi nó được cập nhật) chỉ ghi đè, không
 * tạo thêm dòng lịch sử — khớp thiết kế "chỉ giữ lần xác nhận gần nhất" ở
 * migrations/20260828_add_agreement_acceptances.sql.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ agreementId: string }> }
) {
  const { agreementId } = await params;
  const agreement = getAgreement(agreementId);
  if (!agreement) {
    return NextResponse.json({ error: "Không tìm thấy thỏa thuận." }, { status: 404 });
  }

  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const acceptedAt = new Date().toISOString();
  const { error } = await supabase.from("agreement_acceptances").upsert(
    {
      user_id: userId,
      agreement_id: agreement.id,
      accepted_version: agreement.updatedAt,
      accepted_at: acceptedAt,
    },
    { onConflict: "user_id,agreement_id" }
  );
  if (error) {
    console.error("[profile/agreements/accept] upsert failed:", error);
    return NextResponse.json({ error: "Xác nhận thất bại. Vui lòng thử lại." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, acceptedAt, acceptedVersion: agreement.updatedAt });
}
