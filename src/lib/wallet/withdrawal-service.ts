import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  CAP_WITHDRAWAL_TO_NET_DEPOSITS,
  MAX_WITHDRAWALS_PER_MONTH,
  MIN_WITHDRAWAL_TOKENS,
  tokensToVnd,
} from "@/lib/wallet/config";

type Client = SupabaseClient<Database>;
type WithdrawalRow = Database["public"]["Tables"]["withdrawal_requests"]["Row"];

export type WithdrawalRequestInput = {
  userId: string;
  amountTokens: number;
};

export type WithdrawalResult = { ok: true; request: WithdrawalRow } | { ok: false; error: string };

/**
 * Approximates "withdrawable ceiling" per the AML-style policy default in
 * config.ts. NOT an exact per-token provenance tracker (the wallet is a
 * single fungible balance, deliberately — see config.ts comment) — this
 * sums three lifetime totals and derives a ceiling from them:
 *   remainingDepositPrincipal = total ever deposited − total already
 *     withdrawn-or-in-flight (floors at 0 — can't go negative)
 *   earnedLifetime = total ever earned via settled purchase_credit/
 *     platform_bonus (uncapped — sales revenue withdraws freely)
 * The two combine into an upper bound, additionally capped at the
 * current available balance (never lets you withdraw more than you have).
 */
async function getWithdrawableCap(supabase: Client, userId: string, currentAvailable: number): Promise<number> {
  if (!CAP_WITHDRAWAL_TO_NET_DEPOSITS) return currentAvailable;

  const [deposited, withdrawnOrInFlight, earned] = await Promise.all([
    supabase.from("transactions").select("amount").eq("user_id", userId).eq("type", "topup"),
    supabase
      .from("withdrawal_requests")
      .select("amount_tokens")
      .eq("user_id", userId)
      .in("status", ["processing", "success"]),
    supabase
      .from("transactions")
      .select("amount")
      .eq("user_id", userId)
      .in("type", ["purchase_credit", "platform_bonus"])
      .in("status", ["available", "completed"]),
  ]);

  const totalDeposited = (deposited.data ?? []).reduce((sum, row) => sum + row.amount, 0);
  const totalWithdrawn = (withdrawnOrInFlight.data ?? []).reduce((sum, row) => sum + row.amount_tokens, 0);
  const earnedLifetime = (earned.data ?? []).reduce((sum, row) => sum + row.amount, 0);

  const remainingDepositPrincipal = Math.max(0, totalDeposited - totalWithdrawn);
  return Math.min(currentAvailable, remainingDepositPrincipal + earnedLifetime);
}

export const WithdrawalService = {
  /**
   * Validates every guard from the design doc, then debits + records the
   * request in one atomic RPC call (create_withdrawal_request). Actually
   * initiating the real bank transfer (calling a payout API) is the
   * caller's job right after this resolves — see the route handler and
   * the PayoutGatewayAdapter note below; nothing here talks to a gateway.
   */
  async requestWithdrawal(supabase: Client, input: WithdrawalRequestInput): Promise<WithdrawalResult> {
    if (input.amountTokens < MIN_WITHDRAWAL_TOKENS) {
      return { ok: false, error: `Số token rút tối thiểu là ${MIN_WITHDRAWAL_TOKENS}.` };
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("token_balance, real_name, cccd_verified, bank_code, bank_name, bank_account_number")
      .eq("id", input.userId)
      .single();
    if (profileError || !profile) return { ok: false, error: "Không tìm thấy hồ sơ." };

    if (input.amountTokens > profile.token_balance) {
      return { ok: false, error: "Số dư khả dụng không đủ." };
    }

    // Điều kiện bắt buộc để rút token: CCCD đã xác minh (OCR khớp ảnh,
    // xem api/profile/identity/route.ts) VÀ đã lưu đủ ngân hàng thụ hưởng
    // (api/profile/bank/route.ts) — cả hai cập nhật trong Thông tin cá
    // nhân, không phải điền lại mỗi lần rút.
    if (!profile.cccd_verified || !profile.bank_code || !profile.bank_account_number) {
      return {
        ok: false,
        error:
          "Cần hoàn tất xác minh CCCD và thông tin ngân hàng thụ hưởng trong Thông tin cá nhân trước khi rút token.",
      };
    }
    if (!profile.real_name) {
      return { ok: false, error: "Cần có Tên thật trên hồ sơ trước khi rút token." };
    }

    const since = new Date();
    since.setDate(since.getDate() - 30);
    const { count } = await supabase
      .from("withdrawal_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", input.userId)
      .gte("created_at", since.toISOString());
    if ((count ?? 0) >= MAX_WITHDRAWALS_PER_MONTH) {
      return { ok: false, error: `Bạn đã đạt giới hạn ${MAX_WITHDRAWALS_PER_MONTH} lần rút trong 30 ngày qua.` };
    }

    const cap = await getWithdrawableCap(supabase, input.userId, profile.token_balance);
    if (input.amountTokens > cap) {
      return {
        ok: false,
        error: "Số token này chưa thể rút — vượt quá phần đã nạp/doanh thu đã ghi nhận. Liên hệ hỗ trợ nếu cần.",
      };
    }

    // The actual debit + row insert happens atomically inside this one RPC
    // call — see create_withdrawal_request() in the migration. Raises
    // (surfaced as `error` below) if the balance check fails there too —
    // belt-and-suspenders against a race with another request that debited
    // the balance between our check above and this call.
    const { data, error } = await supabase.rpc("create_withdrawal_request", {
      p_user_id: input.userId,
      p_amount_tokens: input.amountTokens,
      p_amount_vnd: tokensToVnd(input.amountTokens),
      // Lấy thẳng từ hồ sơ đã lưu & xác minh ở trên — KHÔNG còn từ
      // input/client nữa, xem comment ở WithdrawalRequestInput.
      p_bank_account_number: profile.bank_account_number,
      p_bank_account_name: profile.real_name,
      p_bank_code: profile.bank_code,
    });
    if (error) return { ok: false, error: error.message || "Không thể tạo yêu cầu rút tiền." };

    return { ok: true, request: data };
  },

  /**
   * Payout gateway callback handler. Idempotency is enforced DB-side —
   * mark_withdrawal_result() no-ops on a request that isn't still
   * 'processing' (see the migration) — so calling this twice for the same
   * request (gateway retry, or success+failure racing) is always safe.
   */
  async handlePayoutResult(
    supabase: Client,
    params: { requestId: string; success: boolean; gatewayRef?: string; failureReason?: string }
  ): Promise<WithdrawalRow> {
    const { data, error } = await supabase.rpc("mark_withdrawal_result", {
      p_request_id: params.requestId,
      p_success: params.success,
      p_gateway_ref: params.gatewayRef ?? null,
      p_failure_reason: params.failureReason ?? null,
    });
    if (error) throw error;
    return data;
  },
};

/**
 * Payout-initiation interface — mirrors DepositGatewayAdapter in
 * deposit-service.ts. No real gateway chosen yet, so there's no default
 * implementation: wire one in (PayOS/VNPay payout, Casso, VietQR) once
 * you have it, and call it right after requestWithdrawal() succeeds in
 * the route handler. Until then, a created request sits at
 * status='processing' with nothing pushing it further — expected for a
 * stub, not a bug.
 */
export interface PayoutGatewayAdapter {
  name: string;
  initiatePayout(request: WithdrawalRow): Promise<{ gatewayRef: string } | { error: string }>;
}
