import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { OrderService } from "@/lib/orders/order-service";

/** POST /api/orders/:orderId/deposit — dùng chung cho "Đặt cọc" và "Thanh
 * toán phần còn lại" (cùng 1 nút ở thiết kế UI). Nợ buyer ngay qua
 * apply_transaction() (type='order_payment', status='completed') bên
 * trong record_order_payment() — xem ghi chú ở đó về vì sao không dùng
 * 'pending'. */
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const amount = Number(body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Số tiền không hợp lệ." }, { status: 400 });
  }

  try {
    const order = await OrderService.recordPayment(supabase, { orderId, actorId: userId, amount });
    return NextResponse.json({ order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Insufficient balance")) {
      return NextResponse.json({ error: "Số dư token không đủ." }, { status: 400 });
    }
    // Giới hạn số tiền do record_order_payment() cưỡng chế — xem
    // migrations/20260924_enforce_order_payment_amounts.sql.
    const minDeposit = /Deposit must be at least (\d+)/.exec(message);
    if (minDeposit) {
      return NextResponse.json({ error: `Tiền cọc tối thiểu là ${minDeposit[1]} token.` }, { status: 400 });
    }
    const overpay = /Payment exceeds order price \(remaining (-?\d+)\)/.exec(message);
    if (overpay) {
      return NextResponse.json({ error: `Số tiền vượt giá đơn — chỉ còn ${overpay[1]} token cần thanh toán.` }, { status: 400 });
    }
    console.error("[orders] payment failed:", error);
    return NextResponse.json({ error: "Không thực hiện được thanh toán." }, { status: 400 });
  }
}
