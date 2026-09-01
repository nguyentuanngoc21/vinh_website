import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { ORDER_EARNING_HOLD_DAYS } from "@/lib/orders/config";

type Client = SupabaseClient<Database>;
type Order = Database["public"]["Tables"]["orders"]["Row"];

/**
 * Every write path onto the Order state machine, all funneled through the
 * security-definer RPCs added by migrations/20260901_add_order_system_core.sql
 * — same shape as src/lib/wallet/ledger-service.ts. Nothing here does its
 * own read-then-write across `orders`/`order_events`; each call below is
 * ONE round trip to a Postgres function, which is what makes the status
 * change + audit-log insert atomic (Postgres holds the row lock, not
 * application code).
 *
 * Callers must pass a service-role client — there is deliberately no
 * insert/update RLS policy on `orders`/`order_events` for any of these to
 * fall back to.
 */
/** Plain read + manual party check — routes use this before calling any
 * RPC above (and for GET), since the service-role client bypasses RLS
 * entirely (the `orders` RLS select policy is defense-in-depth only, not
 * the real gate for server-side code — same reasoning as messages/follows,
 * see src/lib/wallet/session.ts). Returns null if not found OR the caller
 * is neither the buyer nor the seller — callers should respond 404 either
 * way (don't leak "exists but not yours" vs "doesn't exist"). */
export async function getOrderForActor(supabase: Client, orderId: string, actorId: string): Promise<Order | null> {
  const { data, error } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (error || !data) return null;
  if (data.buyer_id !== actorId && data.seller_id !== actorId) return null;
  return data;
}

export const OrderService = {
  async createOrder(
    supabase: Client,
    params: {
      buyerId: string;
      sellerId: string;
      listingId: string;
      price: number;
      depositPct: number;
      revisionsMax: number;
      tosSnapshot: Record<string, unknown>;
    }
  ): Promise<Order> {
    const { data, error } = await supabase.rpc("create_order", {
      p_buyer_id: params.buyerId,
      p_seller_id: params.sellerId,
      p_listing_id: params.listingId,
      p_price: params.price,
      p_deposit_pct: params.depositPct,
      p_revisions_max: params.revisionsMax,
      p_tos_snapshot: params.tosSnapshot,
    });
    if (error) throw error;
    return data;
  },

  async setScope(
    supabase: Client,
    params: { orderId: string; actorId: string; usageScope: string; scopeNote?: string | null }
  ): Promise<Order> {
    const { data, error } = await supabase.rpc("set_order_scope", {
      p_order_id: params.orderId,
      p_actor_id: params.actorId,
      p_usage_scope: params.usageScope,
      p_scope_note: params.scopeNote ?? null,
    });
    if (error) throw error;
    return data;
  },

  /** Lưu nháp brief trước khi khóa — buyer gọi nhiều lần trong lúc soạn,
   * không tự chuyển status. */
  async setBrief(supabase: Client, params: { orderId: string; actorId: string; brief: string }): Promise<Order> {
    const { data, error } = await supabase.rpc("set_order_brief", {
      p_order_id: params.orderId,
      p_actor_id: params.actorId,
      p_brief: params.brief,
    });
    if (error) throw error;
    return data;
  },

  async confirmBrief(supabase: Client, params: { orderId: string; actorId: string }): Promise<Order> {
    const { data, error } = await supabase.rpc("confirm_order_brief", {
      p_order_id: params.orderId,
      p_actor_id: params.actorId,
    });
    if (error) throw error;
    return data;
  },

  /** Used for BOTH "Đặt cọc" and "Thanh toán phần còn lại" — same button
   * in the design, same backend action. See the SQL function's comment
   * for why only the first call actually moves `status`. */
  async recordPayment(supabase: Client, params: { orderId: string; actorId: string; amount: number }): Promise<Order> {
    const { data, error } = await supabase.rpc("record_order_payment", {
      p_order_id: params.orderId,
      p_actor_id: params.actorId,
      p_amount: params.amount,
    });
    if (error) throw error;
    return data;
  },

  async submitDraft(
    supabase: Client,
    params: { orderId: string; actorId: string; asset: Record<string, unknown> }
  ): Promise<Order> {
    const { data, error } = await supabase.rpc("submit_order_draft", {
      p_order_id: params.orderId,
      p_actor_id: params.actorId,
      p_asset: params.asset,
    });
    if (error) throw error;
    return data;
  },

  async approveDraft(supabase: Client, params: { orderId: string; actorId: string }): Promise<Order> {
    const { data, error } = await supabase.rpc("approve_order_draft", {
      p_order_id: params.orderId,
      p_actor_id: params.actorId,
    });
    if (error) throw error;
    return data;
  },

  async requestRevision(
    supabase: Client,
    params: { orderId: string; actorId: string; note?: string | null }
  ): Promise<Order> {
    const { data, error } = await supabase.rpc("request_order_revision", {
      p_order_id: params.orderId,
      p_actor_id: params.actorId,
      p_note: params.note ?? null,
    });
    if (error) throw error;
    return data;
  },

  async deliver(
    supabase: Client,
    params: { orderId: string; actorId: string; asset?: Record<string, unknown> }
  ): Promise<Order> {
    const { data, error } = await supabase.rpc("deliver_order", {
      p_order_id: params.orderId,
      p_actor_id: params.actorId,
      p_asset: params.asset ?? {},
    });
    if (error) throw error;
    return data;
  },

  /** Buyer-initiated confirm. For the cron's system-initiated auto-confirm,
   * use `confirmReceivedBySystem` instead (keeps the two call sites and
   * their very different auth story visually distinct at call sites). */
  async confirmReceived(supabase: Client, params: { orderId: string; actorId: string }): Promise<Order> {
    const { data, error } = await supabase.rpc("confirm_order_received", {
      p_order_id: params.orderId,
      p_actor_id: params.actorId,
      p_is_system: false,
      p_hold_days: ORDER_EARNING_HOLD_DAYS,
    });
    if (error) throw error;
    return data;
  },

  /** Called by the cron route only (src/app/api/orders/cron/auto-confirm) —
   * `actor_id` stays null in the resulting order_events row (event_type
   * 'auto_confirmed_by_system' instead of 'buyer_confirmed'). */
  async confirmReceivedBySystem(supabase: Client, params: { orderId: string }): Promise<Order> {
    const { data, error } = await supabase.rpc("confirm_order_received", {
      p_order_id: params.orderId,
      p_is_system: true,
      p_hold_days: ORDER_EARNING_HOLD_DAYS,
    });
    if (error) throw error;
    return data;
  },

  /** Gắn 1 truyện của seller vào 1 đơn ghostwriting VÀ cấp quyền xem cho
   * buyer cùng lúc (Mục 4.3 đặc tả) — xem
   * migrations/20260901_add_manuscript_share.sql. */
  async attachBook(supabase: Client, params: { orderId: string; actorId: string; bookId: string }): Promise<Order> {
    const { data, error } = await supabase.rpc("attach_order_book", {
      p_order_id: params.orderId,
      p_actor_id: params.actorId,
      p_book_id: params.bookId,
    });
    if (error) throw error;
    return data;
  },

  /** "Yêu cầu file gốc" (Mục 3.2) — bên KHÔNG yêu cầu phải là bên đồng ý,
   * xem resolveFileRequest(). */
  async requestFile(supabase: Client, params: { orderId: string; actorId: string }) {
    const { data, error } = await supabase.rpc("request_order_file", {
      p_order_id: params.orderId,
      p_actor_id: params.actorId,
    });
    if (error) throw error;
    return data;
  },

  async resolveFileRequest(supabase: Client, params: { requestId: string; actorId: string; agree: boolean }) {
    const { data, error } = await supabase.rpc("resolve_order_file_request", {
      p_request_id: params.requestId,
      p_actor_id: params.actorId,
      p_agree: params.agree,
    });
    if (error) throw error;
    return data;
  },

  /** Mục 5.1 — hàm THUẦN TÚY, dùng để preview số hoàn TRƯỚC khi request
   * hủy thật (request_order_cancel tự gọi lại hàm này để chốt số, không
   * tin số client gửi lên — xem migrations/20260901_add_order_cancel_system.sql). */
  async calculateRefund(supabase: Client, params: { orderId: string; cancelledBy: "buyer" | "seller" }) {
    const { data, error } = await supabase.rpc("calculate_refund", {
      p_order_id: params.orderId,
      p_cancelled_by: params.cancelledBy,
    });
    if (error) throw error;
    return data as {
      stage: string | null;
      pct: number;
      refund_amount: number;
      seller_amount: number;
      cancelled_by: string;
      used_platform_minimum: boolean;
    };
  },

  async requestCancel(supabase: Client, params: { orderId: string; actorId: string }) {
    const { data, error } = await supabase.rpc("request_order_cancel", {
      p_order_id: params.orderId,
      p_actor_id: params.actorId,
    });
    if (error) throw error;
    return data;
  },

  async resolveCancelRequest(supabase: Client, params: { requestId: string; actorId: string; agree: boolean }): Promise<Order> {
    const { data, error } = await supabase.rpc("resolve_order_cancel_request", {
      p_request_id: params.requestId,
      p_actor_id: params.actorId,
      p_agree: params.agree,
    });
    if (error) throw error;
    return data;
  },

  /** Mục 5.4 — "Nhắc phản hồi". */
  async sendReminder(supabase: Client, params: { orderId: string; actorId: string; targetUserId: string }) {
    const { data, error } = await supabase.rpc("record_order_reminder", {
      p_order_id: params.orderId,
      p_actor_id: params.actorId,
      p_target_user_id: params.targetUserId,
    });
    if (error) throw error;
    return data;
  },

  /** Mục 5.4 — "Báo cáo mất liên lạc". Điều kiện bật nút đã validate ở
   * route (xem src/app/api/orders/[orderId]/lost-contact/report/route.ts)
   * — hàm này chỉ ghi mốc, không tự kiểm lại điều kiện. */
  async reportLostContact(supabase: Client, params: { orderId: string; actorId: string }) {
    const { data, error } = await supabase.rpc("record_lost_contact_report", {
      p_order_id: params.orderId,
      p_actor_id: params.actorId,
    });
    if (error) throw error;
    return data;
  },
};
