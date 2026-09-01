import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { DisputeService } from "@/lib/orders/dispute-service";

/** POST /api/orders/:orderId/dispute — "Mở tranh chấp" (Mục 9). Tự chụp
 * lại toàn bộ bằng chứng trong open_dispute() — không cần client gửi kèm
 * gì khác ngoài lý do/mô tả. */
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
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
