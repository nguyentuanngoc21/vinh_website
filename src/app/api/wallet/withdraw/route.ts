import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { WithdrawalService } from "@/lib/wallet/withdrawal-service";

export async function POST(request: Request) {
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const amountTokens = Number(body?.amountTokens);
  const bankAccountNumber = typeof body?.bankAccountNumber === "string" ? body.bankAccountNumber.trim() : "";
  const bankAccountName = typeof body?.bankAccountName === "string" ? body.bankAccountName.trim() : "";
  const bankCode = typeof body?.bankCode === "string" ? body.bankCode.trim() : "";

  if (!Number.isFinite(amountTokens) || amountTokens <= 0 || !bankAccountNumber || !bankAccountName || !bankCode) {
    return NextResponse.json({ error: "Thiếu hoặc sai thông tin yêu cầu rút tiền." }, { status: 400 });
  }

  const result = await WithdrawalService.requestWithdrawal(supabase, {
    userId,
    amountTokens,
    bankAccountNumber,
    bankAccountName,
    bankCode,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Real integration point: initiate the actual bank transfer here via a
  // PayoutGatewayAdapter (withdrawal-service.ts) once one is chosen, e.g.
  //   const payout = await payoutAdapter.initiatePayout(result.request);
  //   if ("error" in payout) await WithdrawalService.handlePayoutResult(supabase, { requestId: result.request.id, success: false, failureReason: payout.error });
  // Until then the request sits at status='processing' — balance is
  // already debited, nothing pushes it further without that adapter.

  return NextResponse.json(result.request, { status: 201 });
}
