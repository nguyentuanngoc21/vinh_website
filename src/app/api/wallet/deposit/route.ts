import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { DepositService } from "@/lib/wallet/deposit-service";
import { createZalopayOrder } from "@/lib/wallet/gateways/zalopay";
import { CUSTOM_UNIT_PRICE, MIN_CUSTOM_TOKENS, clampCustomTokens } from "@/lib/topup";

/**
 * Initiates a ZaloPay deposit: calls ZaloPay's CreateOrder API first, then
 * (only on success) records our own pending deposit_transactions row via
 * DepositService.createOrder, keyed by ZaloPay's app_trans_id — this is
 * what the webhook at /api/wallet/deposit/webhook?gateway=zalopay later
 * matches against. Order matters: if we persisted first and the ZaloPay
 * call then failed, we'd be left with an orphan pending row nothing ever
 * resolves.
 *
 * Returns orderUrl for the client to redirect to (or render as a QR) to
 * complete payment in the ZaloPay sandbox app.
 */
export async function POST(request: Request) {
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const rawTokens = Number(body?.tokenAmount);
  if (!Number.isFinite(rawTokens) || rawTokens < MIN_CUSTOM_TOKENS) {
    return NextResponse.json({ error: `Số token nạp tối thiểu là ${MIN_CUSTOM_TOKENS}.` }, { status: 400 });
  }
  const tokenAmount = clampCustomTokens(rawTokens);
  const amountVnd = tokenAmount * CUSTOM_UNIT_PRICE;

  const order = await createZalopayOrder({
    appUser: userId,
    amountVnd,
    description: `Nap ${tokenAmount} token`,
  });
  if (!order.ok) {
    console.error("[wallet] zalopay createOrder failed:", order.error);
    return NextResponse.json({ error: "Không thể tạo đơn thanh toán ZaloPay." }, { status: 502 });
  }

  const deposit = await DepositService.createOrder(supabase, {
    userId,
    gateway: "zalopay",
    gatewayOrderId: order.appTransId,
    amountVnd,
    tokenAmount,
  });

  return NextResponse.json({ orderUrl: order.orderUrl, depositId: deposit.id }, { status: 201 });
}
