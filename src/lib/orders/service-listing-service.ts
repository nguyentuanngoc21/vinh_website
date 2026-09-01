import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;
type ServiceListing = Database["public"]["Tables"]["service_listings"]["Row"];

export type MissingField = { key: string; label: string };

// Đối chiếu TAXONOMY/ANY_OF trong Vịnh Cá nhân.dc.html — illustration cần
// ĐỦ CẢ 4 tầng (g1-g4), voice chỉ cần ÍT NHẤT 1 trong 2 tầng (v1 hoặc v2)
// có chọn (ghi rõ trong rule: "bỏ trống nếu bạn chỉ nhận [tầng kia]").
// ghostwriting KHÔNG có tầng tag nào (thiết kế gốc không đưa 'write' vào
// TAXONOMY) — không validate gì thêm ở đây cho loại đó.
const REQUIRED_TAG_GROUPS: Record<string, { keys: string[]; anyOf: boolean }> = {
  illustration: { keys: ["g1", "g2", "g3", "g4"], anyOf: false },
  voice: { keys: ["v1", "v2"], anyOf: true },
};

function isTagGroupFilled(tags: Record<string, unknown>, key: string): boolean {
  const v = tags[key];
  return Array.isArray(v) ? v.length > 0 : typeof v === "string" ? v.trim().length > 0 : false;
}

function hasRequiredTags(serviceType: string, tags: Record<string, unknown>): boolean {
  const spec = REQUIRED_TAG_GROUPS[serviceType];
  if (!spec) return true; // ghostwriting — không có tầng tag nào để đòi hỏi
  return spec.anyOf ? spec.keys.some((k) => isTagGroupFilled(tags, k)) : spec.keys.every((k) => isTagGroupFilled(tags, k));
}

/**
 * 11 trường bắt buộc của Mục 2.1 đặc tả — validate ở ĐÂY (service layer),
 * không chỉ UI, vì is_accepting_orders là ràng buộc pháp lý (Mục 2), y
 * hệt cách agreements-tab.tsx/accept-agreement.ts validate đủ thông tin
 * hợp đồng trước khi cho xác nhận (src/lib/legal/contract-info-service.ts)
 * chứ không tin riêng client. #10 (lost_contact_days) và #11 (is_private)
 * có cột NOT NULL DEFAULT nên trên thực tế luôn "đủ" ngay từ lúc tạo —
 * vẫn liệt kê đủ 11 mục để khớp đặc tả, không phải thiếu sót.
 */
export function computeMissingFields(listing: ServiceListing): MissingField[] {
  const missing: MissingField[] = [];
  const tiers = Array.isArray(listing.price_tiers) ? listing.price_tiers : [];
  const hasValidTier = tiers.some((t) => {
    const price = Number((t as { price?: unknown })?.price);
    return Number.isFinite(price) && price > 0;
  });

  if (!listing.name.trim()) missing.push({ key: "name", label: "Tên gói dịch vụ" });
  if (!hasRequiredTags(listing.service_type, listing.tags)) {
    missing.push({
      key: "tags",
      label: listing.service_type === "voice" ? "Phân loại gói (Lồng tiếng/Nhạc cụ)" : "Phân loại gói dịch vụ (đủ 4 tầng thẻ)",
    });
  }
  if (!listing.scope_description.trim()) missing.push({ key: "scope_description", label: "Phạm vi công việc" });
  if (!hasValidTier) missing.push({ key: "price_tiers", label: "Giá/thanh toán" });
  if (listing.deposit_pct == null) missing.push({ key: "deposit_pct", label: "Mốc cọc" });
  if (listing.delivery_days == null) missing.push({ key: "delivery_days", label: "Slot/thời gian giao" });
  if (listing.revisions_max == null) missing.push({ key: "revisions_max", label: "Số lần sửa" });
  if (!listing.accepted_content?.trim() || !listing.rejected_content?.trim()) {
    missing.push({ key: "content_policy", label: "Thể loại nhận/từ chối" });
  }
  if (!listing.default_usage_scope) missing.push({ key: "default_usage_scope", label: "Phạm vi quyền mặc định" });
  // Object 4 key cố định, mỗi giá trị 0-100 — xem ghi chú kiểu ở
  // service_listings.Row (src/lib/supabase/types.ts) và
  // migrations/20260901_add_order_cancel_system.sql (calculate_refund()
  // tra thẳng key này, không so khớp text tự do).
  const REFUND_STAGES = ["before_draft", "draft_pending", "draft_approved", "delivered"] as const;
  const hasCompleteRefundPolicy =
    listing.refund_policy != null &&
    REFUND_STAGES.every((k) => {
      const v = listing.refund_policy?.[k];
      return typeof v === "number" && v >= 0 && v <= 100;
    });
  if (!hasCompleteRefundPolicy) {
    missing.push({ key: "refund_policy", label: "Chính sách hủy/hoàn tiền" });
  }
  if (listing.lost_contact_days == null || listing.lost_contact_days <= 0) {
    missing.push({ key: "lost_contact_days", label: "Thời hạn \"mất liên lạc\"" });
  }
  if (listing.is_private == null) missing.push({ key: "is_private", label: "Chính sách private" });

  return missing;
}

/** Tự tắt is_accepting_orders nếu 1 trong 11 trường rỗng trở lại (Mục 2.1:
 * "Nếu user sửa một trong 11 trường khiến nó rỗng trở lại... hệ thống tự
 * động tắt is_accepting_orders và thông báo lý do") — gọi SAU mỗi lần
 * update, không đợi user tự bấm lại công tắc. */
export function shouldForceStopAccepting(listing: ServiceListing): boolean {
  return listing.is_accepting_orders && computeMissingFields(listing).length > 0;
}

/**
 * Mục 2.2 — sample "auto": 5 sản phẩm mới nhất mà seller đã HOÀN TẤT trên
 * Nền tảng, loại trừ order.is_private, mới nhất trước.
 * - illustration/voice: nguồn là chính Order đã completed CÙNG service_type
 *   với listing đang xét (đơn giản hoá — đặc tả nói "sản phẩm đã hoàn
 *   thành trên Nền tảng" nói chung, ở đây thu hẹp đúng loại hình để sample
 *   không lẫn công việc khác loại).
 * - ghostwriting: nguồn là books.author_id = seller VÀ is_ghostwritten =
 *   false (tác phẩm tự đứng tên thật trên Vịnh, không lẫn hàng viết thuê —
 *   Mục 2.2 + yêu cầu bổ sung #2, xem migrations/20260901_add_ghostwriting_authorship.sql).
 */
export async function fetchAutoSamples(
  supabase: Client,
  params: { sellerId: string; serviceType: ServiceListing["service_type"] }
): Promise<{ title: string; ref: string }[]> {
  if (params.serviceType === "ghostwriting") {
    const { data } = await supabase
      .from("books")
      .select("id, title")
      .eq("author_id", params.sellerId)
      .eq("is_ghostwritten", false)
      .eq("published", true)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(5);
    return (data ?? []).map((b) => ({ title: b.title, ref: b.id }));
  }

  const { data } = await supabase
    .from("orders")
    .select("id, code, completed_at, service_listings!inner(service_type)")
    .eq("seller_id", params.sellerId)
    .eq("status", "completed")
    .eq("is_private", false)
    .eq("service_listings.service_type", params.serviceType)
    .order("completed_at", { ascending: false })
    .limit(5);
  return (data ?? []).map((o) => ({ title: o.code, ref: o.id }));
}
