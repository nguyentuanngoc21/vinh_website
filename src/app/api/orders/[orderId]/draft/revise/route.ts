import { NextResponse } from "next/server";
import { getRequestContext, requestError } from "@/lib/mobile/request-context";
import { OrderService } from "@/lib/orders/order-service";

/** POST /api/orders/:orderId/draft/revise — "Yêu cầu sửa" (buyer). */
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  let auth;
  try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
  const { client: supabase, userId } = auth;
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
