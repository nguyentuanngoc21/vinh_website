import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { LedgerService } from "@/lib/wallet/ledger-service";

type Client = SupabaseClient<Database>;
type DepositRow = Database["public"]["Tables"]["deposit_transactions"]["Row"];

/**
 * One event, however the real gateway's webhook payload happens to be
 * shaped — every adapter below normalizes to this before DepositService
 * touches anything.
 */
export type NormalizedDepositEvent = {
  gatewayOrderId: string;
  status: "success" | "failed";
  /** What the gateway says was actually paid, for reconciliation against
   * our own amount_vnd — see the mismatch check in handleWebhook(). */
  amountVnd: number;
};

export interface DepositGatewayAdapter {
  name: string;
  /** Verify the request is genuinely from the gateway (signature/HMAC
   * over the raw body, per that gateway's docs) and parse it. Return null
   * for "reject this request" — invalid signature or unparseable body. */
  verifyAndParse(rawBody: string, headers: Headers): NormalizedDepositEvent | null;
}

/**
 * Placeholder adapter — NOT wired to any real payment gateway. Swap this
 * out (or add alongside it, keyed by name) once VNPay/PayOS/Momo is
 * actually chosen and you have sandbox credentials + their webhook spec:
 *   - PayOS: HMAC-SHA256 over sorted query params, checksum key from dashboard.
 *   - VNPay: HMAC-SHA512 over sorted params, vnp_SecureHash field.
 *   - Momo: HMAC-SHA256 over a fixed field order, signature field.
 * None of those are guessable without the real docs/keys in hand, so this
 * adapter trusts the body as-is — DO NOT point a real gateway's webhook at
 * it in production; it exists so the rest of the pipeline (idempotency,
 * atomic credit, reconciliation) can be built and tested now.
 */
export const stubGatewayAdapter: DepositGatewayAdapter = {
  name: "stub",
  verifyAndParse(rawBody) {
    try {
      const body = JSON.parse(rawBody);
      if (typeof body?.gatewayOrderId !== "string") return null;
      if (body?.status !== "success" && body?.status !== "failed") return null;
      if (typeof body?.amountVnd !== "number") return null;
      return { gatewayOrderId: body.gatewayOrderId, status: body.status, amountVnd: body.amountVnd };
    } catch {
      return null;
    }
  },
};

const ADAPTERS: Record<string, DepositGatewayAdapter> = {
  stub: stubGatewayAdapter,
  // vnpay: vnpayGatewayAdapter,
  // payos: payosGatewayAdapter,
  // momo: momoGatewayAdapter,
};

export type WebhookResult =
  | { ok: true; alreadyProcessed: boolean; deposit: DepositRow }
  | { ok: false; error: string };

export const DepositService = {
  /** Called before redirecting the user to the gateway's payment page —
   * records our own pending order so the later webhook has something to
   * match against (and so an unsolicited webhook for an order we never
   * created is rejected rather than blindly trusted). */
  async createOrder(
    supabase: Client,
    params: { userId: string; gateway: string; gatewayOrderId: string; amountVnd: number; tokenAmount: number }
  ): Promise<DepositRow> {
    const { data, error } = await supabase
      .from("deposit_transactions")
      .insert({
        user_id: params.userId,
        payment_gateway: params.gateway,
        gateway_order_id: params.gatewayOrderId,
        amount_vnd: params.amountVnd,
        token_amount: params.tokenAmount,
        status: "pending",
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /**
   * Idempotent webhook handler. Safe to call twice (or a hundred times —
   * gateways retry) for the same gatewayOrderId: only the first call that
   * successfully claims the row (the conditional `status = 'pending'`
   * UPDATE below) does any crediting; every later call sees
   * `alreadyProcessed: true` and touches nothing else.
   */
  async handleWebhook(supabase: Client, gateway: string, rawBody: string, headers: Headers): Promise<WebhookResult> {
    const adapter = ADAPTERS[gateway];
    if (!adapter) return { ok: false, error: `Unknown payment gateway: ${gateway}` };

    const event = adapter.verifyAndParse(rawBody, headers);
    if (!event) return { ok: false, error: "Invalid signature or payload" };

    if (event.status === "failed") {
      const { data, error } = await supabase
        .from("deposit_transactions")
        .update({ status: "failed", processed_at: new Date().toISOString() })
        .eq("payment_gateway", gateway)
        .eq("gateway_order_id", event.gatewayOrderId)
        .eq("status", "pending")
        .select()
        .single();
      if (error || !data) {
        // Either the order doesn't exist, or it was already resolved —
        // either way there's nothing left to do; not an error worth
        // surfacing to the gateway (which would just retry forever).
        const { data: existing } = await supabase
          .from("deposit_transactions")
          .select("*")
          .eq("payment_gateway", gateway)
          .eq("gateway_order_id", event.gatewayOrderId)
          .single();
        if (!existing) return { ok: false, error: "Unknown order" };
        return { ok: true, alreadyProcessed: true, deposit: existing };
      }
      return { ok: true, alreadyProcessed: false, deposit: data };
    }

    // event.status === "success" — atomically claim the row (pending ->
    // success) BEFORE crediting anything. If this update affects 0 rows,
    // either the order doesn't exist or a previous delivery already
    // claimed it — this single conditional UPDATE is what makes concurrent
    // duplicate webhook deliveries safe without a separate lock.
    const claimed = await supabase
      .from("deposit_transactions")
      .update({ status: "success", processed_at: new Date().toISOString() })
      .eq("payment_gateway", gateway)
      .eq("gateway_order_id", event.gatewayOrderId)
      .eq("status", "pending")
      .select()
      .single();

    if (claimed.error || !claimed.data) {
      const { data: existing } = await supabase
        .from("deposit_transactions")
        .select("*")
        .eq("payment_gateway", gateway)
        .eq("gateway_order_id", event.gatewayOrderId)
        .single();
      if (!existing) return { ok: false, error: "Unknown order" };
      return { ok: true, alreadyProcessed: true, deposit: existing };
    }

    const deposit = claimed.data;

    if (deposit.amount_vnd !== event.amountVnd) {
      // Reconciliation flag, not a hard failure — we credit based on OUR
      // own order record (token_amount was fixed when the order was
      // created, before the user ever reached the gateway), never on
      // whatever the webhook claims, so a tampered/mismatched webhook
      // can't credit more tokens than the order was actually for. Still
      // worth crediting (the money did arrive) but this should page
      // finance to check for a gateway-side discrepancy.
      console.error(
        `[wallet] deposit ${deposit.id}: amount mismatch — order ${deposit.amount_vnd}đ, gateway reported ${event.amountVnd}đ`
      );
    }

    // Credit the wallet. If this throws, best-effort revert the claim back
    // to 'pending' so the gateway's own webhook retry can complete it —
    // this is the one place a hard crash between "claimed" and "credited"
    // could otherwise strand an order as success-but-uncredited.
    try {
      const txn = await LedgerService.recordTransaction(supabase, {
        userId: deposit.user_id,
        type: "topup",
        amount: deposit.token_amount,
        referenceType: "deposit_transaction",
        referenceId: deposit.id,
      });
      const { data: updated } = await supabase
        .from("deposit_transactions")
        .update({ transaction_id: txn.id })
        .eq("id", deposit.id)
        .select()
        .single();
      return { ok: true, alreadyProcessed: false, deposit: updated ?? deposit };
    } catch (err) {
      await supabase.from("deposit_transactions").update({ status: "pending" }).eq("id", deposit.id);
      console.error(`[wallet] deposit ${deposit.id}: credit failed, reverted to pending for retry`, err);
      throw err;
    }
  },
};
