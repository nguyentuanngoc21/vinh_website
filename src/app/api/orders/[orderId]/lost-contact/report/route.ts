import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { OrderService, getOrderForActor } from "@/lib/orders/order-service";
import { canReportLostContact } from "@/lib/orders/lost-contact";

/** POST /api/orders/:orderId/lost-contact/report — "Báo cáo mất liên
 * lạc" — re-validate điều kiện ở SERVER trước khi ghi (không tin nút đã
 * enable ở client). Xử lý/leo thang tranh chấp là việc của Module 9
 * (chưa làm) — ở đây chỉ ghi mốc bất biến. */
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

  const status = await canReportLostContact(supabase, { orderId, buyerId: order.buyer_id, sellerId: order.seller_id });
  if (!status.eligible) {
    return NextResponse.json(
      { error: "Chưa đủ điều kiện báo cáo mất liên lạc (cần đã nhắc ≥7 ngày và không ai phản hồi ≥72 giờ)." },
      { status: 400 }
    );
  }

  try {
    const event = await OrderService.reportLostContact(supabase, { orderId, actorId: userId });
    return NextResponse.json({ event });
  } catch (error) {
    console.error("[orders] report lost contact failed:", error);
    return NextResponse.json({ error: "Không gửi được báo cáo." }, { status: 400 });
  }
}
