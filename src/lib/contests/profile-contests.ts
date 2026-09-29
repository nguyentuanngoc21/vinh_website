/**
 * Mục "Cuộc thi" trong hồ sơ Kết nối (Phase 3, Slice 3.3 — K8), cùng cấp
 * Truyện chữ / Audio / Design. Dùng chung cho /ket-noi và /api/mobile/connect
 * (qua loadConnectDirectory). Chỉ thông tin đã công khai:
 *   - Bài dự thi hợp lệ (eligible / shortlisted) của cuộc thi đã công khai.
 *     Đang diễn ra → "Đang dự thi"; đã công bố kết quả → giải (chưa thu hồi)
 *     + hạng chung cuộc (lượt tính đang công bố — Slice 2.6b), nếu có.
 *   - Huy hiệu Passport "Người đi hết mùa thi" (Slice 3.2) — cả người đọc.
 * Không lộ số phiếu / điểm thành phần.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { ConnectWorkItem } from "@/lib/connect/types";
import { PASSPORT_BADGE_NAME } from "@/lib/contests/passport-service";

type Client = SupabaseClient<Database>;

// Theo giờ Việt Nam, không theo múi giờ server (Vercel chạy UTC).
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" });

export async function loadProfileContests(client: Client, userIds: string[], now: Date = new Date()): Promise<Map<string, ConnectWorkItem[]>> {
  const result = new Map<string, ConnectWorkItem[]>();
  if (userIds.length === 0) return result;

  const [subsRes, passportsRes] = await Promise.all([
    client.from("contest_submissions").select("id, contest_id, book_id, author_id, submitted_at")
      .in("author_id", userIds).in("status", ["eligible", "shortlisted"]),
    client.from("contest_passports").select("user_id, contest_id, completed_at").in("user_id", userIds),
  ]);
  if (subsRes.error || passportsRes.error) {
    console.error("[ket-noi] profile contests query failed:", subsRes.error ?? passportsRes.error);
    return result;
  }
  const subs = subsRes.data ?? [];
  const passports = passportsRes.data ?? [];
  const contestIds = [...new Set([...subs.map((s) => s.contest_id), ...passports.map((p) => p.contest_id)])];
  if (contestIds.length === 0) return result;

  const [contestsRes, booksRes, awardsRes, runsRes] = await Promise.all([
    client.from("contests").select("id, slug, title, status, key_visual_url, results_published_at").in("id", contestIds).neq("status", "draft"),
    subs.length ? client.from("books").select("id, title, published, deleted_at").in("id", [...new Set(subs.map((s) => s.book_id))]) : Promise.resolve({ data: [], error: null }),
    subs.length
      ? client.from("contest_awards").select("submission_id, award_name, award_rank").in("submission_id", subs.map((s) => s.id)).is("revoked_at", null)
      : Promise.resolve({ data: [], error: null }),
    client.from("contest_score_runs").select("id, contest_id").in("contest_id", contestIds).not("published_at", "is", null).is("superseded_at", null),
  ]);
  if (contestsRes.error || booksRes.error || awardsRes.error || runsRes.error) {
    console.error("[ket-noi] profile contests details failed:", contestsRes.error ?? booksRes.error ?? awardsRes.error ?? runsRes.error);
    return result;
  }
  const contestById = new Map((contestsRes.data ?? []).map((c) => [c.id, c]));
  const bookById = new Map((booksRes.data ?? []).map((b) => [b.id, b]));
  const resultsVisible = (c: { results_published_at: string | null } | undefined) =>
    Boolean(c?.results_published_at && Date.parse(c.results_published_at) <= now.getTime());

  const runIds = (runsRes.data ?? []).filter((r) => resultsVisible(contestById.get(r.contest_id))).map((r) => r.id);
  const { data: ranks } = runIds.length && subs.length
    ? await client.from("contest_score_snapshots").select("submission_id, rank").in("run_id", runIds).in("submission_id", subs.map((s) => s.id))
    : { data: [] as { submission_id: string; rank: number }[] };
  const rankBySub = new Map((ranks ?? []).map((r) => [r.submission_id, r.rank]));
  const awardsBySub = new Map<string, string[]>();
  for (const a of awardsRes.data ?? []) awardsBySub.set(a.submission_id, [...(awardsBySub.get(a.submission_id) ?? []), a.award_name]);

  const pending = new Map<string, { item: ConnectWorkItem; sortAt: number }[]>();
  const push = (userId: string, item: ConnectWorkItem, sortAt: number) => {
    pending.set(userId, [...(pending.get(userId) ?? []), { item, sortAt }]);
  };

  for (const s of subs) {
    const c = contestById.get(s.contest_id);
    const book = bookById.get(s.book_id);
    if (!c || !book || !book.published || book.deleted_at) continue;
    const parts = [`Bài dự thi: ${book.title}`];
    if (resultsVisible(c)) {
      const awards = awardsBySub.get(s.id) ?? [];
      if (awards.length) parts.push(awards.join(", "));
      const rank = rankBySub.get(s.id);
      if (rank !== undefined) parts.push(`Hạng #${rank} chung cuộc`);
      if (!awards.length && rank === undefined) parts.push("Đã tham gia");
    } else {
      parts.push("Đang dự thi");
    }
    push(s.author_id, {
      id: `sub-${s.id}`,
      title: c.title,
      meta: parts.join(" · "),
      date: shortDate(s.submitted_at),
      href: `/cuoc-thi/${c.slug}${resultsVisible(c) ? "?tab=ket-qua" : ""}`,
      imageUrl: c.key_visual_url,
    }, Date.parse(s.submitted_at));
  }
  for (const p of passports) {
    const c = contestById.get(p.contest_id);
    if (!c) continue;
    push(p.user_id, {
      id: `passport-${p.contest_id}-${p.user_id}`,
      title: c.title,
      meta: `Huy hiệu “${PASSPORT_BADGE_NAME}”`,
      date: shortDate(p.completed_at),
      href: `/cuoc-thi/${c.slug}`,
      imageUrl: c.key_visual_url,
    }, Date.parse(p.completed_at));
  }

  for (const [userId, list] of pending) {
    result.set(userId, list.sort((a, b) => b.sortAt - a.sortAt).map((x) => x.item));
  }
  return result;
}
