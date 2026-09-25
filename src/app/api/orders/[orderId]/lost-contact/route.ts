import { NextResponse } from "next/server";
import { getRequestContext, requestError } from "@/lib/mobile/request-context";
import { getOrderForActor } from "@/lib/orders/order-service";
import { canReportLostContact } from "@/lib/orders/lost-contact";

/** GET /api/orders/:orderId/lost-contact — trạng thái điều kiện bật nút
 * "Báo cáo mất liên lạc" (Mục 5.4). */
export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  let auth;
  try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
  const { client: supabase, userId } = auth;
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
