import { NextResponse } from "next/server";
import { orderErrorMessage } from "@/lib/orders/rpc-errors";
import { getRequestContext, requestError } from "@/lib/mobile/request-context";
import { AuthorNameAgreementService } from "@/lib/orders/author-name-agreement-service";

/** PATCH /api/orders/:orderId/author-name-agreement/:agreementId — bên
 * còn lại xác nhận (statement text sinh ở server, xem service). */
export async function PATCH(request: Request, { params }: { params: Promise<{ orderId: string; agreementId: string }> }) {
  const { agreementId } = await params;
  let auth;
  try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
  const { client: supabase, userId } = auth;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const agreement = await AuthorNameAgreementService.confirm(supabase, { agreementId, actorId: userId });
    return NextResponse.json({ agreement });
  } catch (error) {
    const message = orderErrorMessage(error, "Không xác nhận được.");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
