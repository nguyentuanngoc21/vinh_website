import { NextResponse } from "next/server";
import { getRequestContext, requestError } from "@/lib/mobile/request-context";
import { OrderService } from "@/lib/orders/order-service";

/** POST /api/orders/:orderId/draft/approve — "Duyệt bản nháp" (buyer). */
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  let auth;
  try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
  const { client: supabase, userId } = auth;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const order = await OrderService.approveDraft(supabase, { orderId, actorId: userId });
    return NextResponse.json({ order });
  } catch (error) {
    console.error("[orders] approve draft failed:", error);
    return NextResponse.json({ error: "Không duyệt được bản nháp." }, { status: 400 });
  }
}
