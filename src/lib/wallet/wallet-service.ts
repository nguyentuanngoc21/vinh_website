import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export type WalletBalance = {
  available: number;
  pending: number;
};

/**
 * Read-only lookups for the wallet's two balances and its ledger history.
 * Every write to profiles.token_balance* goes exclusively through the
 * apply_transaction()-family RPCs (see LedgerService) — this service never
 * writes, so it's safe to call with either the RLS-checked client (the
 * user reading their own wallet) or the service-role client (an admin
 * lookup, a route handler resolving a session).
 */
export const WalletService = {
  async getBalance(supabase: Client, userId: string): Promise<WalletBalance | null> {
    const { data, error } = await supabase
      .from("profiles")
      .select("token_balance, token_balance_pending")
      .eq("id", userId)
      .single();

    if (error || !data) return null;
    return { available: data.token_balance, pending: data.token_balance_pending };
  },

  /** Paginated ledger history for one user, newest first. */
  async getTransactions(
    supabase: Client,
    userId: string,
    { limit = 50, offset = 0 }: { limit?: number; offset?: number } = {}
  ) {
    const { data, error, count } = await supabase
      .from("transactions")
      .select("*", { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return { entries: data ?? [], total: count ?? 0 };
  },
};
