import { NextResponse } from "next/server";
import { getRequestContext, requestError } from "@/lib/mobile/request-context";
import { OrderService, getOrderForActor } from "@/lib/orders/order-service";

/** POST /api/orders/:orderId/lost-contact/reminder — "Nhắc phản hồi". */
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
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
  const targetUserId = userId === order.buyer_id ? order.seller_id : order.buyer_id;

  try {
    const event = await OrderService.sendReminder(supabase, { orderId, actorId: userId, targetUserId });
    return NextResponse.json({ event });
  } catch (error) {
    console.error("[orders] send reminder failed:", error);
    return NextResponse.json({ error: "Không gửi được nhắc nhở." }, { status: 400 });
  }
}
