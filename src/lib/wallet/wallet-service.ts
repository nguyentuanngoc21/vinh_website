import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;
type TransactionRow = Database["public"]["Tables"]["transactions"]["Row"];

/** Dòng lịch sử ví + mô tả cụ thể nếu có (vd "Giải Nhất — Giải Truyện Ngắn Mùa Thu 2026"). */
export type WalletTransaction = TransactionRow & { description: string | null };

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

  /**
   * Paginated ledger history for one user, newest first. Khoản chi trả giải
   * cuộc thi (platform_bonus) kèm tên giải + cuộc thi, tra theo
   * contest_awards.payout_transaction_id — không dùng ghi chú lý do chung
   * của platform_bonus_grants (có thể là ghi chú nội bộ của admin).
   */
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
    const rows = data ?? [];
    const descriptions = await awardDescriptions(
      supabase,
      rows.filter((r) => r.type === "platform_bonus").map((r) => r.id)
    );
    const entries: WalletTransaction[] = rows.map((r) => ({ ...r, description: descriptions.get(r.id) ?? null }));
    return { entries, total: count ?? 0 };
  },
};

/** Tên giải + cuộc thi cho các giao dịch chi trả giải. Lỗi chỉ ghi log — lịch sử ví vẫn hiện nhãn chung. */
async function awardDescriptions(supabase: Client, transactionIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (transactionIds.length === 0) return result;
  const { data: awards, error } = await supabase
    .from("contest_awards")
    .select("payout_transaction_id, award_name, contest_id")
    .in("payout_transaction_id", transactionIds);
  if (error) {
    console.error("[wallet] award descriptions failed:", error);
    return result;
  }
  const contestIds = [...new Set((awards ?? []).map((a) => a.contest_id))];
  const { data: contests, error: contestError } = contestIds.length
    ? await supabase.from("contests").select("id, title").in("id", contestIds)
    : { data: [], error: null };
  if (contestError) console.error("[wallet] award contest titles failed:", contestError);
  const titleById = new Map((contests ?? []).map((c) => [c.id, c.title]));
  for (const a of awards ?? []) {
    if (!a.payout_transaction_id) continue;
    const title = titleById.get(a.contest_id);
    result.set(a.payout_transaction_id, title ? `${a.award_name} — ${title}` : a.award_name);
  }
  return result;
}
