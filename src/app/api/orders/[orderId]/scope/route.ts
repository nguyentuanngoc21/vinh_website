import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { OrderService } from "@/lib/orders/order-service";

const VALID_SCOPES = ["personal", "commercial_limited", "commercial_full"];

/** POST /api/orders/:orderId/scope — "Chọn phạm vi quyền sử dụng" (buyer). */
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const usageScope = typeof body?.usageScope === "string" ? body.usageScope : "";
  const scopeNote = typeof body?.scopeNote === "string" ? body.scopeNote : null;
  if (!VALID_SCOPES.includes(usageScope)) {
    return NextResponse.json({ error: "Phạm vi quyền sử dụng không hợp lệ." }, { status: 400 });
  }
  if (usageScope === "commercial_limited" && !scopeNote?.trim()) {
    return NextResponse.json({ error: "Cần mô tả mục đích sử dụng thương mại." }, { status: 400 });
  }

  try {
    const order = await OrderService.setScope(supabase, { orderId, actorId: userId, usageScope, scopeNote });
    return NextResponse.json({ order });
  } catch (error) {
    console.error("[orders] set scope failed:", error);
    return NextResponse.json({ error: "Không đặt được phạm vi quyền sử dụng." }, { status: 400 });
  }
}
