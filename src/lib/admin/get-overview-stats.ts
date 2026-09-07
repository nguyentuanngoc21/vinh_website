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

/** Số liệu THẬT cho admin/page.tsx (Tổng quan) — thay 1 phần
 * OverviewKpis/TransactionsTable đang bịa hoàn toàn (dựng từ ngày đầu
 * scaffold dự án, chưa từng đấu nối dữ liệu thật). Chỉ nối những gì tính
 * được rõ ràng, không đoán mò công thức cho những chỉ số cần hạ tầng
 * tracking chưa tồn tại (DAU/MAU, retention cohort, tỉ lệ chuyển đổi
 * free→trả phí, chi trả tác giả — không có định nghĩa kế toán rõ ràng để
 * tính đúng, xem OverviewKpis).
 *
 * revenueVnd30d = tổng amount_vnd của deposit_transactions THÀNH CÔNG
 * trong 30 ngày — Supabase JS không có SUM qua PostgREST select thường,
 * nên tải cột amount_vnd rồi cộng ở JS (đúng kiểu "list rồi tự xử lý"
 * đang dùng ở /admin/noi-dung, /admin/tranh-chap — xem comment ở đó).
 * Nếu volume lớn lên, nên đổi sang 1 hàm SQL SUM() thật thay vì tải hết
 * dòng về. */
export async function getOverviewStats(supabase: SupabaseClient<Database>): Promise<OverviewStats> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [signupsRes, txCountRes, depositsRes, recentTxRes] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", cutoff),
    supabase.from("transactions").select("id", { count: "exact", head: true }).gte("created_at", cutoff),
    supabase.from("deposit_transactions").select("amount_vnd").eq("status", "success").gte("created_at", cutoff),
    supabase
      .from("transactions")
      .select("id, user_id, type, amount, status, created_at")
      .order("created_at", { ascending: false })
      .limit(RECENT_TRANSACTIONS_LIMIT),
  ]);

  const revenueVnd30d = (depositsRes.data ?? []).reduce((sum, row) => sum + row.amount_vnd, 0);

  const rows = recentTxRes.data ?? [];
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id, nickname").in("id", userIds)
    : { data: [] as { id: string; nickname: string }[] };
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
