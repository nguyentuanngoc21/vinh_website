import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { OrderService, getOrderForActor } from "@/lib/orders/order-service";

/** POST /api/orders/:orderId/lost-contact/reminder — "Nhắc phản hồi". */
export async function POST(_request: Request, { params }: { params: Promise<{ orderId: string }> }) {
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
  const targetUserId = userId === order.buyer_id ? order.seller_id : order.buyer_id;

  try {
    const event = await OrderService.sendReminder(supabase, { orderId, actorId: userId, targetUserId });
    return NextResponse.json({ event });
  } catch (error) {
    console.error("[orders] send reminder failed:", error);
    return NextResponse.json({ error: "Không gửi được nhắc nhở." }, { status: 400 });
  }
}
