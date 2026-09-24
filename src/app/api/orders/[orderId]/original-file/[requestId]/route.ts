import { NextResponse } from "next/server";
import { getRequestContext, requestError } from "@/lib/mobile/request-context";
import { OrderService } from "@/lib/orders/order-service";

/** PATCH /api/orders/:orderId/original-file/:requestId — bên CÒN LẠI
 * đồng ý/từ chối mở khóa file gốc ({ agree: boolean }). */
export async function PATCH(request: Request, { params }: { params: Promise<{ orderId: string; requestId: string }> }) {
  const { requestId } = await params;
  let auth;
  try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
  const { client: supabase, userId } = auth;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const agree = body?.agree === true;

  try {
    const resolved = await OrderService.resolveFileRequest(supabase, { requestId, actorId: userId, agree });
    return NextResponse.json({ request: resolved });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không xử lý được yêu cầu.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
