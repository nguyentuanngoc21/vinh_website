import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { OrderService } from "@/lib/orders/order-service";
import { rejectUnauthorizedCron } from "@/lib/cron-auth";

/**
 * Scheduled via vercel.json — quét mọi đơn `delivered` mà `auto_confirm_at`
 * đã qua và buyer chưa tự xác nhận, tự xác nhận thay (Mục 3.2 đặc tả,
 * hàng "Xác nhận đã nhận"). Cùng cơ chế Bearer CRON_SECRET với
 * src/app/api/wallet/cron/settle-pending.
 */
export async function GET(request: Request) {
  const denied = rejectUnauthorizedCron(request, "orders/auto-confirm");
  if (denied) return denied;

  const supabase = createServiceRoleClient();
  const { data: due, error } = await supabase
    .from("orders")
    .select("id")
    .eq("status", "delivered")
    .lte("auto_confirm_at", new Date().toISOString())
    .limit(500);
  if (error) {
    console.error("[orders] auto-confirm scan failed:", error);
    return NextResponse.json({ error: "Quét dữ liệu thất bại." }, { status: 500 });
  }

  let confirmed = 0;
  for (const row of due ?? []) {
    try {
      await OrderService.confirmReceivedBySystem(supabase, { orderId: row.id });
      confirmed += 1;
    } catch (err) {
      // 1 đơn lỗi không được chặn cả batch — giống settle_due_pending_transactions
      // bỏ qua entry đã settle rồi thay vì abort. Log để soát lại thủ công.
      console.error(`[orders] auto-confirm failed for order ${row.id}:`, err);
    }
  }

  return NextResponse.json({ confirmedCount: confirmed });
}
