import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { OrderService } from "@/lib/orders/order-service";

/** POST /api/orders/:orderId/attach-book — seller (ghostwriter) gắn 1
 * truyện của mình vào đơn viết thuê này; buyer được cấp quyền xem ngay
 * (xem attach_order_book() trong migrations/20260901_add_manuscript_share.sql). */
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const bookId = typeof body?.bookId === "string" ? body.bookId : null;
  if (!bookId) {
    return NextResponse.json({ error: "Thiếu bookId." }, { status: 400 });
  }

  try {
    const order = await OrderService.attachBook(supabase, { orderId, actorId: userId, bookId });
    return NextResponse.json({ order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không gắn được truyện vào đơn hàng.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
