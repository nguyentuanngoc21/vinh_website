import { NextResponse } from "next/server";
import { getRequestContext, requestError } from "@/lib/mobile/request-context";
import { OrderService } from "@/lib/orders/order-service";

/** PATCH /api/orders/:orderId/cancel/:requestId — bên CÒN LẠI đồng ý/từ
 * chối yêu cầu hủy ({ agree: boolean }). Đồng ý -> hoàn tiền + đóng đơn
 * ngay trong resolve_order_cancel_request(). */
export async function PATCH(request: Request, { params }: { params: Promise<{ orderId: string; requestId: string }> }) {
  const { requestId } = await params;
  let auth;
  try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
  const { client: supabase, userId } = auth;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const agree = body?.agree === true;

  try {
    const order = await OrderService.resolveCancelRequest(supabase, { requestId, actorId: userId, agree });
    return NextResponse.json({ order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không xử lý được yêu cầu hủy.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
