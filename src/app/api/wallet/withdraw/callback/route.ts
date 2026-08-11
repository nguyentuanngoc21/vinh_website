import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { WithdrawalService } from "@/lib/wallet/withdrawal-service";

/**
 * Payout gateway confirmation callback — same "no gateway chosen yet"
 * caveat as the deposit webhook: this trusts the request body as-is.
 * Once a real payout API (PayOS/VNPay payout, Casso, VietQR) is wired in,
 * verify its signature here BEFORE calling handlePayoutResult — otherwise
 * anyone who can guess/find a requestId could fabricate a success/failure.
 *
 * Idempotent regardless: handlePayoutResult() -> mark_withdrawal_result()
 * no-ops on a request that isn't still 'processing', so duplicate/replayed
 * callbacks are always safe even before that signature check exists.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const requestId = typeof body?.requestId === "string" ? body.requestId : "";
  const success = body?.success === true;
  const gatewayRef = typeof body?.gatewayRef === "string" ? body.gatewayRef : undefined;
  const failureReason = typeof body?.failureReason === "string" ? body.failureReason : undefined;

  if (!requestId) {
    return NextResponse.json({ error: "Missing requestId" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  try {
    const updated = await WithdrawalService.handlePayoutResult(supabase, {
      requestId,
      success,
      gatewayRef,
      failureReason,
    });
    return NextResponse.json(updated);
  } catch (err) {
    console.error("[wallet] withdraw callback failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
