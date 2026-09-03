import type { SupabaseClient } from "@supabase/supabase-js";
import { getAgreement } from "@/lib/legal/registry";
import type { Database } from "@/lib/supabase/types";

export const COMMISSION_AGREEMENT_ID = "bo-quy-tac-commission";

/**
 * Chặn bật service_listings.is_accepting_orders = true khi Người cung cấp
 * dịch vụ chưa xác nhận (hoặc xác nhận đã lỗi thời — văn bản có bản cập
 * nhật mới hơn) "Bộ quy tắc giao dịch Commission" (agreement_acceptances,
 * xem migrations/20260828_add_agreement_acceptances.sql). Cùng cơ chế với
 * hasAcceptedExclusivityPolicy() (src/lib/authoring/exclusivity-agreement.ts)
 * cho Hợp đồng khai thác độc quyền — tách file riêng vì đây là 2 tính năng
 * độc lập (Nhận đơn commission ≠ đăng truyện độc quyền), không đáng gộp
 * chung 1 hàm rồi truyền agreementId làm tham số.
 *
 * Gọi từ PATCH /api/profile/services/[listingId] khi requestedAccepting
 * === true. Không chặn chiều true -> false hay giữ nguyên false/true —
 * chỉ chặn lúc BẬT (khớp `else if (current.is_accepting_orders)` ở route
 * đó vẫn tự tắt lại vì thiếu 11 trường, không phải vì thiếu xác nhận văn
 * bản — 1 listing đã bật trước khi tính năng chặn này tồn tại không tự bị
 * tắt, chỉ bị chặn BẬT LẠI nếu đã tắt).
 *
 * Dùng chung 1 supabase client với route gọi nó (kể cả service-role
 * client) — luôn lọc rõ theo `userId` nên không cần dựa vào RLS.
 */
export async function hasAcceptedCommissionRules(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<boolean> {
  const agreement = getAgreement(COMMISSION_AGREEMENT_ID);
  if (!agreement) return true; // registry thiếu entry — không tự khoá tính năng vì lỗi cấu hình.

  const { data } = await supabase
    .from("agreement_acceptances")
    .select("accepted_version")
    .eq("user_id", userId)
    .eq("agreement_id", COMMISSION_AGREEMENT_ID)
    .maybeSingle();

  return !!data && data.accepted_version === agreement.updatedAt;
}

export const COMMISSION_AGREEMENT_ERROR =
  'Bạn cần đọc và xác nhận "Bộ quy tắc giao dịch Commission" (mục Cam kết & Thỏa thuận trong Trang cá nhân) trước khi bật "Nhận đơn".';
