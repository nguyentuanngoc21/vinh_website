import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { OrderService } from "@/lib/orders/order-service";

/** POST /api/orders/:orderId/draft/revise — "Yêu cầu sửa" (buyer). */
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const note = typeof body?.note === "string" ? body.note : null;

  try {
    const order = await OrderService.requestRevision(supabase, { orderId, actorId: userId, note });
    return NextResponse.json({ order });
  } catch (error) {
    console.error("[orders] request revision failed:", error);
    return NextResponse.json({ error: "Không yêu cầu sửa được — có thể đã hết lượt sửa." }, { status: 400 });
  }
}
