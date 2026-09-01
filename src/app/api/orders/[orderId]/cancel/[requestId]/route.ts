import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { OrderService } from "@/lib/orders/order-service";

/** PATCH /api/orders/:orderId/cancel/:requestId — bên CÒN LẠI đồng ý/từ
 * chối yêu cầu hủy ({ agree: boolean }). Đồng ý -> hoàn tiền + đóng đơn
 * ngay trong resolve_order_cancel_request(). */
export async function PATCH(request: Request, { params }: { params: Promise<{ orderId: string; requestId: string }> }) {
  const { requestId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
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
