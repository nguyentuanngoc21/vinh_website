import { checkQueryErrors, fetchAllRows } from "./query-utils";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TransactionType, TransactionStatus } from "@/lib/supabase/types";

export type RecentTransaction = {
  id: string;
  userName: string;
  type: TransactionType;
  amount: number;
  status: TransactionStatus;
  createdAt: string;
};

export type OverviewStats = {
  newSignups30d: number;
  transactionsCount30d: number;
  revenueVnd30d: number;
  recentTransactions: RecentTransaction[];
};

const RECENT_TRANSACTIONS_LIMIT = 8;

export async function getOverviewStats(supabase: SupabaseClient<Database>): Promise<OverviewStats> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [signupsRes, txCountRes, depositsRes, recentTxRes] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", cutoff),
    supabase.from("transactions").select("id", { count: "exact", head: true }).gte("created_at", cutoff),
    fetchAllRows((from, to) => supabase.from("deposit_transactions").select("amount_vnd").eq("status", "success").gte("processed_at", cutoff).order("id").range(from, to)),
    supabase
      .from("transactions")
      .select("id, user_id, type, amount, status, created_at")
      .order("created_at", { ascending: false })
      .limit(RECENT_TRANSACTIONS_LIMIT),
  ]);

  checkQueryErrors([signupsRes, txCountRes, recentTxRes]);
  const revenueVnd30d = depositsRes.reduce((sum, row) => sum + row.amount_vnd, 0);

  const rows = recentTxRes.data ?? [];
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const profilesRes = userIds.length
    ? await supabase.from("profiles").select("id, nickname").in("id", userIds)
    : { data: [] as { id: string; nickname: string }[], error: null };
  checkQueryErrors([profilesRes]);
  const profiles = profilesRes.data;
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.nickname]));

  const recentTransactions: RecentTransaction[] = rows.map((r) => ({
    id: r.id,
    userName: nameById.get(r.user_id) ?? "—",
    type: r.type,
    amount: r.amount,
    status: r.status,
    createdAt: r.created_at,
  }));

  return {
    newSignups30d: signupsRes.count ?? 0,
    transactionsCount30d: txCountRes.count ?? 0,
    revenueVnd30d,
    recentTransactions,
  };
}
