import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { AuthorNameAgreementService } from "@/lib/orders/author-name-agreement-service";

/** PATCH /api/orders/:orderId/author-name-agreement/:agreementId — bên
 * còn lại xác nhận (statement text sinh ở server, xem service). */
export async function PATCH(_request: Request, { params }: { params: Promise<{ orderId: string; agreementId: string }> }) {
  const { agreementId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const agreement = await AuthorNameAgreementService.confirm(supabase, { agreementId, actorId: userId });
    return NextResponse.json({ agreement });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không xác nhận được.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
