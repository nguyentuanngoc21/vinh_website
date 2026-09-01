import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { OrderService } from "@/lib/orders/order-service";

/** POST /api/orders/:orderId/draft — "Gửi bản nháp" (seller). */
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const asset = body?.asset && typeof body.asset === "object" ? body.asset : {};

  try {
    const order = await OrderService.submitDraft(supabase, { orderId, actorId: userId, asset });
    return NextResponse.json({ order });
  } catch (error) {
    console.error("[orders] submit draft failed:", error);
    return NextResponse.json({ error: "Không gửi được bản nháp." }, { status: 400 });
  }
}
