import { NextResponse } from "next/server";
import { getRequestContext, requestError } from "@/lib/mobile/request-context";
import { OrderService } from "@/lib/orders/order-service";

/** POST /api/orders/:orderId/draft — "Gửi bản nháp" (seller). */
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  let auth;
  try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
  const { client: supabase, userId } = auth;
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
