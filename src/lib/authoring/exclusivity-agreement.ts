import type { SupabaseClient } from "@supabase/supabase-js";
import { getAgreement } from "@/lib/legal/registry";
import type { Database } from "@/lib/supabase/types";

const EXCLUSIVITY_AGREEMENT_ID = "chinh-sach-doc-quyen";

/**
 * Chặn bật books.is_exclusive = true khi tác giả chưa xác nhận (hoặc xác
 * nhận đã lỗi thời — văn bản có bản cập nhật mới hơn) "Chính sách độc
 * quyền xuất bản" (agreement_acceptances, xem
 * migrations/20260828_add_agreement_acceptances.sql). Gọi từ:
 *   - POST /api/authoring/books (isExclusive === true)
 *   - PATCH /api/authoring/books/[bookId] (is_exclusive: true)
 * Không chặn chiều true -> false hay giữ nguyên false — chỉ chặn lúc BẬT.
 *
 * Dùng client RLS thật của người gọi (không service-role) — policy "users
 * manage their own agreement acceptances" đã giới hạn đúng 1 hàng của
 * chính user_id đó, không cần tự lọc thêm.
 */
export async function hasAcceptedExclusivityPolicy(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<boolean> {
  const agreement = getAgreement(EXCLUSIVITY_AGREEMENT_ID);
  if (!agreement) return true; // registry thiếu entry — không tự khoá tính năng vì lỗi cấu hình.

  const { data } = await supabase
    .from("agreement_acceptances")
    .select("accepted_version")
    .eq("user_id", userId)
    .eq("agreement_id", EXCLUSIVITY_AGREEMENT_ID)
    .maybeSingle();

  return !!data && data.accepted_version === agreement.updatedAt;
}

export const EXCLUSIVITY_AGREEMENT_ERROR =
  "Bạn cần đọc và xác nhận Chính sách độc quyền xuất bản (mục Cam kết & Thỏa thuận trong Trang cá nhân) trước khi đăng truyện ở chế độ độc quyền.";
