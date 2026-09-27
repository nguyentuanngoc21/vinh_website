/**
 * Tín hiệu gian lận (Phase 2, Slice 2.4 — P10). Hệ thống CHỈ gắn tín hiệu;
 * chỉ tín hiệu admin xác nhận mới loại phiếu và lượt đọc của tài khoản đó khỏi
 * điểm cuộc thi (refresh_contest_scores). Không bao giờ tự khoá tài khoản.
 *
 *   - detectFraudSignals(): quét 1 cuộc thi (admin mở tab Gian lận, bấm
 *     "Quét lại", hoặc cron 0h VN). Chỉ cuộc thi đang/đã bình chọn chưa công bố.
 *   - reviewFraudSignal(): xác nhận / bỏ qua / mở lại, rồi tính lại bảng điểm
 *     ngay để admin thấy tác động (không chờ 15 phút).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContestFraudStatus, ContestStatus, Database } from "@/lib/supabase/types";
import { ContestError, throwIfError } from "@/lib/contests/errors";

type Client = SupabaseClient<Database>;
type SignalRow = Database["public"]["Tables"]["contest_fraud_signals"]["Row"];

/** Ngưỡng phát hiện — nơi duy nhất định nghĩa, truyền vào detect_contest_fraud_signals(). */
export const FRAUD_THRESHOLDS = {
  /** ≥ số phiếu này … */
  rapidVotes: 10,
  /** … trong ngần này phút → "Bình chọn dồn dập". */
  rapidMinutes: 10,
  /** Phiếu đầu tiên trong ngần này ngày sau khi tài khoản vừa đủ tuổi bình chọn … */
  newAccountGraceDays: 3,
  /** … và bầu ≥ ngần này tác phẩm → "Tài khoản vừa đủ tuổi bầu hàng loạt". */
  newAccountVotes: 5,
} as const;

/** Cuộc thi đang có phiếu mới và chưa chốt điểm. */
export const FRAUD_SCAN_STATUSES: ContestStatus[] = ["community_voting", "judging"];
/** Sau công bố bảng điểm đã chốt — không xét lại được. */
export const FRAUD_LOCKED_STATUSES: ContestStatus[] = ["results", "archived"];

export type AdminFraudSignal = SignalRow & {
  user_name: string | null;
  user_username: string | null;
  book_title: string | null;
  reviewer_name: string | null;
};

export type FraudCounts = Record<ContestFraudStatus, number>;

export async function detectFraudSignals(client: Client, contestId: string): Promise<number> {
  const { data, error } = await client.rpc("detect_contest_fraud_signals", {
    p_contest_id: contestId,
    p_rapid_votes: FRAUD_THRESHOLDS.rapidVotes,
    p_rapid_minutes: FRAUD_THRESHOLDS.rapidMinutes,
    p_new_account_grace_days: FRAUD_THRESHOLDS.newAccountGraceDays,
    p_new_account_votes: FRAUD_THRESHOLDS.newAccountVotes,
  });
  throwIfError(error, "detect_contest_fraud_signals");
  return data ?? 0;
}

export async function getFraudCounts(client: Client, contestId: string): Promise<FraudCounts> {
  const counts: FraudCounts = { open: 0, confirmed: 0, dismissed: 0 };
  const results = await Promise.all(
    (Object.keys(counts) as ContestFraudStatus[]).map((status) =>
      client.from("contest_fraud_signals").select("id", { count: "exact", head: true }).eq("contest_id", contestId).eq("status", status)
    )
  );
  (Object.keys(counts) as ContestFraudStatus[]).forEach((status, i) => {
    throwIfError(results[i].error, "count fraud signals");
    counts[status] = results[i].count ?? 0;
  });
  return counts;
}

export async function listFraudSignals(
  client: Client,
  input: { contestId: string; status: ContestFraudStatus | "all" }
): Promise<AdminFraudSignal[]> {
  let query = client
    .from("contest_fraud_signals")
    .select("*")
    .eq("contest_id", input.contestId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(200);
  if (input.status !== "all") query = query.eq("status", input.status);
  const { data, error } = await query;
  throwIfError(error, "listFraudSignals");
  const rows = data ?? [];

  const userIds = [...new Set(rows.flatMap((r) => [r.user_id, r.reviewed_by]).filter((x): x is string => x !== null))];
  const submissionIds = [...new Set(rows.map((r) => r.submission_id).filter((x): x is string => x !== null))];
  const [profiles, subs] = await Promise.all([
    userIds.length ? client.from("profiles").select("id, nickname, username").in("id", userIds) : Promise.resolve({ data: [], error: null }),
    submissionIds.length
      ? client.from("contest_submissions").select("id, book_id").in("id", submissionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  throwIfError(profiles.error, "load signal users");
  throwIfError(subs.error, "load signal submissions");
  const bookIds = (subs.data ?? []).map((s) => s.book_id);
  const books = bookIds.length ? await client.from("books").select("id, title").in("id", bookIds) : { data: [], error: null };
  throwIfError(books.error, "load signal books");

  const profileById = new Map((profiles.data ?? []).map((p) => [p.id, p]));
  const bookTitle = new Map((books.data ?? []).map((b) => [b.id, b.title]));
  const bookBySub = new Map((subs.data ?? []).map((s) => [s.id, bookTitle.get(s.book_id) ?? null]));

  return rows.map((r) => {
    const user = r.user_id ? profileById.get(r.user_id) : undefined;
    const reviewer = r.reviewed_by ? profileById.get(r.reviewed_by) : undefined;
    return {
      ...r,
      user_name: user?.nickname ?? null,
      user_username: user?.username ?? null,
      book_title: r.submission_id ? (bookBySub.get(r.submission_id) ?? null) : null,
      reviewer_name: reviewer ? (reviewer.nickname ?? reviewer.username) : null,
    };
  });
}

export async function reviewFraudSignal(
  client: Client,
  input: { contestId: string; signalId: string; adminId: string; status: ContestFraudStatus; note: string | null }
): Promise<SignalRow> {
  const { data: existing, error: loadError } = await client
    .from("contest_fraud_signals")
    .select("id")
    .eq("id", input.signalId)
    .eq("contest_id", input.contestId)
    .maybeSingle();
  throwIfError(loadError, "load fraud signal");
  if (!existing) throw new ContestError("signal_not_found");

  const { data, error } = await client.rpc("review_contest_fraud_signal", {
    p_signal_id: input.signalId,
    p_admin_id: input.adminId,
    p_status: input.status,
    p_note: input.note,
  });
  throwIfError(error, "review_contest_fraud_signal");

  // Tác động lên điểm hiện ngay (xác nhận = loại phiếu + lượt đọc của tài khoản).
  const { error: refreshError } = await client.rpc("refresh_contest_scores", { p_contest_id: input.contestId, p_force: true, p_freeze: false });
  if (refreshError) console.error("[contests] refresh scores after review failed:", refreshError);
  return data as SignalRow;
}

export type FraudCronResult = { scanned: string[]; created: number; errors: string[] };

/** Cron 0h VN: quét mọi cuộc thi đang/đã bình chọn chưa công bố. */
export async function detectAllActiveFraud(client: Client): Promise<FraudCronResult> {
  const result: FraudCronResult = { scanned: [], created: 0, errors: [] };
  const { data, error } = await client.from("contests").select("id, slug").in("status", FRAUD_SCAN_STATUSES);
  throwIfError(error, "load contests to scan");
  for (const c of data ?? []) {
    try {
      result.created += await detectFraudSignals(client, c.id);
      result.scanned.push(c.slug);
    } catch (e) {
      result.errors.push(`${c.slug}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return result;
}
