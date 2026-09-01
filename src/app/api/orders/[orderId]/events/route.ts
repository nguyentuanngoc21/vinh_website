import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { getOrderForActor } from "@/lib/orders/order-service";

/**
 * GET /api/orders/:orderId/events — toàn bộ nhật ký mốc thời gian của 1
 * đơn (order_events), mới nhất trước. Đây là nơi tra cứu trực tiếp cho
 * yêu cầu "mỗi hành động quan trọng phải để lại mốc thời gian" — mọi RPC
 * ở src/lib/orders/order-service.ts đều ghi vào bảng này, không có hành
 * động nào bỏ qua.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const order = await getOrderForActor(supabase, orderId, userId);
  if (!order) {
    return NextResponse.json({ error: "Không tìm thấy đơn hàng." }, { status: 404 });
  }

  const { data: events, error } = await supabase
    .from("order_events")
    .select("id, event_type, actor_id, payload, created_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[orders] events fetch failed:", error);
    return NextResponse.json({ error: "Không tải được nhật ký đơn hàng." }, { status: 500 });
  }

  return NextResponse.json({ events: events ?? [] });
}
