import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { OrderService, getOrderForActor } from "@/lib/orders/order-service";

/** GET /api/orders/:orderId/cancel — xem TRƯỚC số tiền sẽ hoàn nếu MÌNH
 * là bên yêu cầu hủy (Mục 3.3: hiển thị số cho 2 bên xác nhận trước khi
 * thực thi) — KHÔNG tạo request nào, chỉ preview. */
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

  const cancelledBy = userId === order.buyer_id ? "buyer" : "seller";
  try {
    const preview = await OrderService.calculateRefund(supabase, { orderId, cancelledBy });
    return NextResponse.json({ preview });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("NO_REFUND_POLICY")) {
      return NextResponse.json(
        { error: "Dịch vụ này chưa có chính sách hoàn tiền — không thể tính tự động. Liên hệ Nền tảng để được hỗ trợ." },
        { status: 400 }
      );
    }
    console.error("[orders] calculate refund failed:", error);
    return NextResponse.json({ error: "Không tính được số tiền hoàn." }, { status: 500 });
  }
}

/** POST /api/orders/:orderId/cancel — "Yêu cầu hủy đơn" — chốt số hoàn
 * tại thời điểm này, chờ bên còn lại đồng ý (PATCH .../cancel/:requestId). */
export async function POST(_request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const request_ = await OrderService.requestCancel(supabase, { orderId, actorId: userId });
    return NextResponse.json({ request: request_ });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không gửi được yêu cầu hủy.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
