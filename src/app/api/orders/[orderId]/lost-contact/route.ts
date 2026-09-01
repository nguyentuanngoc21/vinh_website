import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { getOrderForActor } from "@/lib/orders/order-service";
import { canReportLostContact } from "@/lib/orders/lost-contact";

/** GET /api/orders/:orderId/lost-contact — trạng thái điều kiện bật nút
 * "Báo cáo mất liên lạc" (Mục 5.4). */
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

  const status = await canReportLostContact(supabase, { orderId, buyerId: order.buyer_id, sellerId: order.seller_id });
  return NextResponse.json(status);
}
