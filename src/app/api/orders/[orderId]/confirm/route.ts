import { NextResponse } from "next/server";
import { getRequestContext, requestError } from "@/lib/mobile/request-context";
import { OrderService } from "@/lib/orders/order-service";

/** POST /api/orders/:orderId/confirm — "Xác nhận đã nhận" (buyer). Cộng
 * pending cho seller (order_earning, hold ORDER_EARNING_HOLD_DAYS ngày,
 * dùng lại cron settle-pending sẵn có) và đóng đơn. Xem
 * src/app/api/orders/cron/auto-confirm cho nhánh hệ thống tự xác nhận
 * sau 7 ngày nếu buyer không bấm. */
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  let auth;
  try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
  const { client: supabase, userId } = auth;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const order = await OrderService.confirmReceived(supabase, { orderId, actorId: userId });
    return NextResponse.json({ order });
  } catch (error) {
    console.error("[orders] confirm received failed:", error);
    return NextResponse.json({ error: "Không xác nhận được — đơn có thể chưa ở trạng thái đã bàn giao." }, { status: 400 });
  }
}
