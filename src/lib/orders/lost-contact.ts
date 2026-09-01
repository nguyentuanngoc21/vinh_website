import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

const RESPONSE_WINDOW_MS = 72 * 60 * 60 * 1000; // 72 giờ
const MIN_TOTAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 ngày

/**
 * Mục 5.4 đặc tả — điều kiện bật nút "Báo cáo mất liên lạc": đã nhắc ít
 * nhất 1 lần, VÀ đã ≥7 ngày kể từ lần nhắc ĐẦU TIÊN, VÀ không ai nhắn gì
 * thêm trong hội thoại suốt ≥72 giờ qua. Đọc lại từ order_events +
 * direct_messages mỗi lần gọi — không lưu cờ "đã đủ điều kiện" nào (dễ
 * lệch nếu có tin nhắn mới sau khi đã tính 1 lần).
 *
 * 1 hàm dùng chung cho GET (hiển thị điều kiện ở UI) và POST report (xác
 * minh lại trước khi ghi — không tin riêng client), đúng khuyến nghị đặc
 * tả "viết thành 1 hàm kiểm tra điều kiện riêng, không hardcode rải rác".
 */
export async function canReportLostContact(
  supabase: Client,
  params: { orderId: string; buyerId: string; sellerId: string }
): Promise<{ eligible: boolean; firstReminderAt: string | null; lastMessageAt: string | null }> {
  const { data: reminders } = await supabase
    .from("order_events")
    .select("created_at")
    .eq("order_id", params.orderId)
    .eq("event_type", "reminder_sent")
    .order("created_at", { ascending: true })
    .limit(1);
  const firstReminderAt = reminders?.[0]?.created_at ?? null;

  const { data: messages } = await supabase
    .from("direct_messages")
    .select("created_at")
    .or(
      `and(sender_id.eq.${params.buyerId},recipient_id.eq.${params.sellerId}),and(sender_id.eq.${params.sellerId},recipient_id.eq.${params.buyerId})`
    )
    .order("created_at", { ascending: false })
    .limit(1);
  const lastMessageAt = messages?.[0]?.created_at ?? null;

  if (!firstReminderAt) return { eligible: false, firstReminderAt: null, lastMessageAt };

  const now = Date.now();
  const sinceFirstReminder = now - new Date(firstReminderAt).getTime();
  const sinceLastMessage = lastMessageAt ? now - new Date(lastMessageAt).getTime() : Infinity;

  return {
    eligible: sinceFirstReminder >= MIN_TOTAL_MS && sinceLastMessage >= RESPONSE_WINDOW_MS,
    firstReminderAt,
    lastMessageAt,
  };
}
