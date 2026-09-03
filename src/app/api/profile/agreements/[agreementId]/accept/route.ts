import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { getAgreement } from "@/lib/legal/registry";
import { AGREEMENT_PARTY_INFO } from "@/lib/legal/contract-parties";
import { resolveAuthorContractInfo } from "@/lib/legal/contract-info-service";

/**
 * POST /api/profile/agreements/:agreementId/accept — ghi nhận việc người
 * dùng hiện tại vừa xác nhận (nút "Xác nhận" ở bảng, hoặc "Tôi đồng ý"
 * trong popup xem văn bản) một thỏa thuận, ở ĐÚNG version hiện tại của nó
 * (registry.ts AGREEMENTS[...].updatedAt) — không nhận version từ client,
 * tránh việc client tự gửi version cũ để "xác nhận khống".
 *
 * CHỐT CHẶN THẬT (không chỉ dựa vào client): nếu văn bản có khai báo
 * field "Bên A" ở AGREEMENT_PARTY_INFO (contract-parties.ts) — tức văn
 * bản có chỗ trống cần điền thông tin thật của tác giả — chỉ cho xác
 * nhận khi TẤT CẢ field đó đã có giá trị trong hồ sơ. Thiếu field nào,
 * trả 400 kèm `missingFields` để client tự điều hướng qua trang Thông
 * tin cá nhân, kéo tới đúng ô còn thiếu (xem accept-agreement.ts,
 * agreement-document-viewer.tsx, edit-profile-tab.tsx) — không chặn
 * bằng cách disable nút ở client rồi thôi, vì có thể gọi thẳng API này.
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

  const authorFields = AGREEMENT_PARTY_INFO[agreementId as keyof typeof AGREEMENT_PARTY_INFO]?.author;
  if (authorFields && authorFields.length > 0) {
    const info = await resolveAuthorContractInfo(supabase, userId);
    // `mergedWith` (contract-parties.ts) gộp 2 field hồ sơ vào chung 1 chỗ
    // trống trong văn bản (vd "Số CCCD/Hộ chiếu, cấp ngày") — thiếu field
    // phụ đó cũng phải chặn xác nhận, liệt kê riêng bằng đúng nhãn của nó
    // (không phải nhãn gộp) — cùng logic với agreement-document-viewer.tsx.
    const missingFields: { key: string; label: string }[] = [];
    for (const field of authorFields) {
      if (!info?.[field.key]) missingFields.push({ key: field.key, label: field.label });
      if (field.mergedWith && !info?.[field.mergedWith.key]) {
        missingFields.push({ key: field.mergedWith.key, label: field.mergedWith.label });
      }
    }
    if (!info || missingFields.length > 0) {
      return NextResponse.json(
        {
          error: `Bạn cần điền đủ thông tin (${missingFields.map((f) => f.label).join(", ")}) ở Thông tin cá nhân trước khi xác nhận "${agreement.name}".`,
          missingFields,
        },
        { status: 400 }
      );
    }
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
