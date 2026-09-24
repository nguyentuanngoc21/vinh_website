import { NextResponse } from "next/server";
import { getRequestContext, requestError } from "@/lib/mobile/request-context";
import { getOrderForActor } from "@/lib/orders/order-service";

/**
 * GET /api/orders/:orderId/requests — yêu cầu cần 2 bên cùng đồng ý đang
 * gắn với đơn: yêu cầu file gốc mới nhất (mọi trạng thái, để biết đã mở khóa
 * chưa) và yêu cầu hủy đang chờ. Trước đây các yêu cầu này chỉ nằm trong
 * state trình duyệt của NGƯỜI GỬI (order-card.tsx), nên bên còn lại không bao
 * giờ thấy nút đồng ý/từ chối. Chỉ 2 bên của đơn đọc được.
 */
export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
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

  const [file, cancel] = await Promise.all([
    supabase.from("order_file_requests").select("id, requested_by, status, created_at, resolved_at")
      .eq("order_id", orderId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("order_cancel_requests").select("id, requested_by, cancelled_by, refund_amount, status, created_at")
      .eq("order_id", orderId).eq("status", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (file.error || cancel.error) {
    console.error("[orders] requests fetch failed:", file.error || cancel.error);
    return NextResponse.json({ error: "Không tải được yêu cầu của đơn hàng." }, { status: 500 });
  }
  return NextResponse.json({ fileRequest: file.data, cancelRequest: cancel.data });
}
