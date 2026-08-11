import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TransactionType } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;
type Transaction = Database["public"]["Tables"]["transactions"]["Row"];

/**
 * Every write path onto the ledger, all funneled through the DB-side RPCs
 * added by migrations/20260807_wallet_ledger_extension.sql (plus the
 * pre-existing apply_transaction()). Nothing here does its own multi-step
 * read-then-write across the wallet — each call below is ONE round trip
 * to a `security definer` Postgres function, which is what actually makes
 * it atomic (Postgres, not application code, holds the transaction
 * boundary and the implicit row lock on the `profiles` row it updates).
 *
 * Callers must pass a service-role client (see src/lib/supabase/server.ts)
 * — there is deliberately no RLS insert policy on `transactions` for any
 * of these to fall back to.
 */
export const LedgerService = {
  /** Thin wrapper over the existing apply_transaction() RPC for the simple,
   * instant (non-pending) cases: deposits, admin adjustments, etc. */
  async recordTransaction(
    supabase: Client,
    params: { userId: string; type: TransactionType; amount: number; referenceType?: string; referenceId?: string }
  ): Promise<Transaction> {
    const { data, error } = await supabase.rpc("apply_transaction", {
      p_user_id: params.userId,
      p_type: params.type,
      p_amount: params.amount,
      p_reference_type: params.referenceType ?? null,
      p_reference_id: params.referenceId ?? null,
    });
    if (error) throw error;
    return data;
  },

  /**
   * Buyer debit + author pending credit + platform revenue, atomically.
   * `holdDays` defaults to config.HOLD_PERIOD_DAYS — passed explicitly
   * here (rather than baked into the SQL function) so a promo/contest
   * chapter could ship with a shorter or zero hold without a migration.
   */
  async createPurchase(
    supabase: Client,
    params: {
      buyerId: string;
      authorId: string;
      chapterId: string;
      amount: number;
      authorShare: number;
      platformShare: number;
      holdDays: number;
    }
  ) {
    const { data, error } = await supabase.rpc("create_purchase", {
      p_buyer_id: params.buyerId,
      p_author_id: params.authorId,
      p_chapter_id: params.chapterId,
      p_amount: params.amount,
      p_author_share: params.authorShare,
      p_platform_share: params.platformShare,
      p_hold_days: params.holdDays,
    });
    if (error) throw error;
    return data;
  },

  /**
   * Admin-only. `adminId` is re-validated against profiles.role INSIDE the
   * SQL function (see grant_platform_bonus()) — the route handler's
   * session check is the first gate, this is the second, since the
   * service-role client used here bypasses RLS entirely.
   */
  async grantPlatformBonus(
    supabase: Client,
    params: { adminId: string; recipientId: string; amount: number; reason: string }
  ): Promise<Transaction> {
    const { data, error } = await supabase.rpc("grant_platform_bonus", {
      p_admin_id: params.adminId,
      p_recipient_id: params.recipientId,
      p_amount: params.amount,
      p_reason: params.reason,
    });
    if (error) throw error;
    return data;
  },

  /** Called by the cron route only (src/app/api/wallet/cron/settle-pending).
   * Moves every `pending` entry whose available_at has passed into
   * `available`, crediting token_balance from token_balance_pending. */
  async settleDuePendingTransactions(supabase: Client, limit = 500): Promise<Transaction[]> {
    const { data, error } = await supabase.rpc("settle_due_pending_transactions", { p_limit: limit });
    if (error) throw error;
    return data ?? [];
  },
};
