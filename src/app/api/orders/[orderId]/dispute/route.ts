import { NextResponse } from "next/server";
import { getRequestContext, requestError } from "@/lib/mobile/request-context";
import { DisputeService } from "@/lib/orders/dispute-service";

/** POST /api/orders/:orderId/dispute — "Mở tranh chấp" (Mục 9). Tự chụp
 * lại toàn bộ bằng chứng trong open_dispute() — không cần client gửi kèm
 * gì khác ngoài lý do/mô tả. */
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  let auth;
  try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
  const { client: supabase, userId } = auth;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const reasonCategory = typeof body?.reasonCategory === "string" ? body.reasonCategory.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  if (!reasonCategory || !description) {
    return NextResponse.json({ error: "Thiếu lý do hoặc mô tả tranh chấp." }, { status: 400 });
  }

  try {
    const dispute = await DisputeService.open(supabase, { orderId, reporterId: userId, reasonCategory, description });
    return NextResponse.json({ dispute });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không mở được tranh chấp.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
