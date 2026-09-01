import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { OrderService } from "@/lib/orders/order-service";

/** PATCH /api/orders/:orderId/brief — lưu nháp brief (buyer, trước khi khóa). */
export async function PATCH(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const brief = typeof body?.brief === "string" ? body.brief : "";

  try {
    const order = await OrderService.setBrief(supabase, { orderId, actorId: userId, brief });
    return NextResponse.json({ order });
  } catch (error) {
    console.error("[orders] set brief failed:", error);
    return NextResponse.json({ error: "Không lưu được brief." }, { status: 400 });
  }
}

/** POST /api/orders/:orderId/brief — "Duyệt brief" (buyer, khóa lại). */
export async function POST(_request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const order = await OrderService.confirmBrief(supabase, { orderId, actorId: userId });
    return NextResponse.json({ order });
  } catch (error) {
    console.error("[orders] confirm brief failed:", error);
    return NextResponse.json({ error: "Không duyệt được brief — kiểm tra đã chọn phạm vi quyền sử dụng và brief không để trống." }, { status: 400 });
  }
}
