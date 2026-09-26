/**
 * Vòng đời cuộc thi — chuyển trạng thái và việc đi kèm mỗi bước, dùng chung
 * cho admin (/api/admin/contests/[id]/status) và cron (/api/contests/cron/advance).
 *
 *   - Mở nhận bài → gửi "Nhắc tôi khi mở" (Q4).
 *   - Đóng nhận bài → chụp mọi bài chưa có bản chụp (D3; bài bị sửa sau hạn
 *     đã được trigger chụp bản trước khi sửa — Q1), rồi kiểm lại điều kiện
 *     trên SỐ LIỆU BẢN CHỤP và gắn cờ cho admin (D4 — không đổi status).
 *   - Công bố kết quả → tính bảng điểm lần cuối rồi chốt (P8).
 *
 * Cron chỉ "bắt kịp" các mốc theo giờ; đúng/sai quyền của người dùng không phụ
 * thuộc cron (capability luôn kiểm cả thời gian thật).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContestStatus, Database } from "@/lib/supabase/types";
import { readContestConfig } from "@/lib/contests/config";
import type { ContestRow } from "@/lib/contests/contest-service";
import { CLOSE_FLAG_CODE, evaluateCloseChecks } from "@/lib/contests/eligibility/close";
import { throwIfError, toContestError } from "@/lib/contests/errors";
import { freezeScores } from "@/lib/contests/scores-service";

type Client = SupabaseClient<Database>;

type TransitionInput = { contestId: string; to: ContestStatus; adminId: string | null; reason: string | null };

async function transitionWithTasks(client: Client, input: TransitionInput): Promise<{ contest: ContestRow; close: CloseSummary | null }> {
  const { data, error } = await client.rpc("transition_contest_status", {
    p_contest_id: input.contestId,
    p_to: input.to,
    p_actor_id: input.adminId,
    p_reason: input.reason,
  });
  throwIfError(error, "transition_contest_status");
  const contest = data as ContestRow;
  if (input.to === "submission_open") await notifyOpenReminders(client, contest);
  const close = input.to === "submission_closed" ? await runCloseTasks(client, contest) : null;
  if (input.to === "results") await freezeFinalScores(client, contest);
  if (input.to === "archived") await captureLegacyStats(client, contest);
  return { contest, close };
}

/**
 * P8: công bố kết quả → giải Độc giả yêu thích và BXH dùng phiếu đã lọc, tính
 * 1 lần rồi chốt. Lỗi chỉ ghi log (kết quả đã công bố): BXH tự chốt ở lần xem
 * đầu, cron 0h chốt nốt.
 */
async function freezeFinalScores(client: Client, contest: ContestRow) {
  try {
    await freezeScores(client, contest.id);
  } catch (error) {
    console.error("[contests] freeze scores at results failed:", error);
  }
}

export async function transitionContest(client: Client, input: TransitionInput): Promise<ContestRow> {
  return (await transitionWithTasks(client, input)).contest;
}

/**
 * Q4 "Nhắc tôi khi mở": gửi thông báo cho người đã bật nhắc, đánh dấu
 * notified_at để cron/admin chuyển trạng thái lần nữa không gửi lặp. Lỗi ở
 * đây không làm hỏng việc chuyển trạng thái (đã commit) — chỉ ghi log.
 */
export async function notifyOpenReminders(client: Client, contest: Pick<ContestRow, "id" | "slug" | "title">): Promise<number> {
  const { data: pending, error } = await client
    .from("contest_reminders")
    .select("user_id")
    .eq("contest_id", contest.id)
    .is("notified_at", null)
    .limit(5000);
  if (error) {
    console.error("[contests] load reminders failed:", error);
    return 0;
  }
  const userIds = (pending ?? []).map((r) => r.user_id);
  if (userIds.length === 0) return 0;

  const { error: notifError } = await client.from("notifications").insert(
    userIds.map((user_id) => ({
      user_id,
      type: "contest_submission_open",
      title: `${contest.title} đã mở nhận bài`,
      link: `/cuoc-thi/${contest.slug}`,
    }))
  );
  if (notifError) {
    console.error("[contests] reminder notifications failed:", notifError);
    return 0;
  }
  const { error: markError } = await client
    .from("contest_reminders")
    .update({ notified_at: new Date().toISOString() })
    .eq("contest_id", contest.id)
    .in("user_id", userIds);
  if (markError) console.error("[contests] mark reminders failed:", markError);
  return userIds.length;
}

export type CloseSummary = { snapshots: number; flagged: number };

/**
 * Việc của bước đóng nhận bài. Idempotent: chụp lại không trùng (unique theo
 * bài), cờ đã mở cùng mã không gắn lại (flag_exists bị bỏ qua) — cron chạy lại
 * hoặc admin bấm lại đều an toàn.
 */
export async function runCloseTasks(client: Client, contest: ContestRow, now: Date = new Date()): Promise<CloseSummary> {
  const { data: snapshots, error } = await client.rpc("snapshot_contest_submissions", { p_contest_id: contest.id });
  throwIfError(error, "snapshot_contest_submissions");

  const { data: rows, error: rowsError } = await client
    .from("contest_submission_snapshots")
    .select("submission_id, chapter_count, total_words")
    .eq("contest_id", contest.id)
    .eq("reason", "submission_closed");
  throwIfError(rowsError, "load snapshots");

  const rules = readContestConfig(contest).eligibility;
  let flagged = 0;
  for (const snap of rows ?? []) {
    const failed = evaluateCloseChecks({
      contest,
      rules,
      stats: { chapter_count: snap.chapter_count, total_words: snap.total_words },
      now,
    });
    for (const check of failed) {
      // Sau hạn tác giả không sửa được bản chụp nữa → cờ dành cho admin quyết
      // (giữ hoặc đánh không hợp lệ), không hiện "Cần bổ sung" cho tác giả.
      const { error: flagError } = await client.rpc("add_contest_review_flag", {
        p_submission_id: snap.submission_id,
        p_admin_id: null,
        p_code: CLOSE_FLAG_CODE[check.code] ?? `${check.code}_at_close`,
        p_message: `Lúc đóng nhận bài: ${check.message}`,
        p_fix_by: null,
        p_visible_to_author: false,
      });
      const mapped = toContestError(flagError);
      if (flagError && mapped?.code !== "flag_exists" && mapped?.code !== "not_allowed") {
        throwIfError(flagError, "add close flag");
      }
      if (!flagError) flagged += 1;
    }
  }
  return { snapshots: snapshots ?? 0, flagged };
}

export type AdvanceResult = { opened: string[]; closed: { slug: string; snapshots: number; flagged: number }[]; errors: string[] };

/**
 * Cron hằng ngày: bắt kịp mở / đóng nhận bài theo giờ. Cuộc thi đã đóng nhưng
 * còn bài chưa chụp (vd lần chạy trước lỗi giữa chừng) được chụp lại.
 */
export async function advanceDueContests(client: Client, now: Date = new Date()): Promise<AdvanceResult> {
  const nowIso = now.toISOString();
  const result: AdvanceResult = { opened: [], closed: [], errors: [] };

  const [toOpen, toClose, closed] = await Promise.all([
    client.from("contests").select("*").eq("status", "announced").lte("submission_start", nowIso),
    client.from("contests").select("*").eq("status", "submission_open").lte("submission_end", nowIso),
    client.from("contests").select("*").in("status", ["submission_closed", "community_voting", "judging"]),
  ]);
  throwIfError(toOpen.error, "load contests to open");
  throwIfError(toClose.error, "load contests to close");
  throwIfError(closed.error, "load closed contests");

  for (const c of toOpen.data ?? []) {
    try {
      await transitionContest(client, { contestId: c.id, to: "submission_open", adminId: null, reason: "Tự động: tới giờ mở nhận bài" });
      result.opened.push(c.slug);
    } catch (e) {
      result.errors.push(`${c.slug}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  for (const c of toClose.data ?? []) {
    try {
      const { close } = await transitionWithTasks(client, { contestId: c.id, to: "submission_closed", adminId: null, reason: "Tự động: hết hạn nhận bài" });
      result.closed.push({ slug: c.slug, snapshots: close?.snapshots ?? 0, flagged: close?.flagged ?? 0 });
    } catch (e) {
      result.errors.push(`${c.slug}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  // Lưới an toàn: cuộc thi đã đóng mà còn bài chưa chụp.
  for (const c of closed.data ?? []) {
    try {
      const { data: n, error } = await client.rpc("snapshot_contest_submissions", { p_contest_id: c.id });
      throwIfError(error, "snapshot_contest_submissions");
      if (n) result.closed.push({ slug: c.slug, snapshots: n, flagged: 0 });
    } catch (e) {
      result.errors.push(`${c.slug}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return result;
}

export type LegacyStats = {
  entries: number;
  authors: number;
  valid_votes: number;
  words: number;
  awards: number;
  captured_at: string;
};

/**
 * Thống kê mùa thi chụp 1 lần khi lưu trữ (XIX.2) — tab "Dấu ấn" đọc từ đây,
 * không tính lại mỗi lần xem. Lỗi chỉ ghi log: chuyển trạng thái đã xong và
 * tab Dấu ấn vẫn hiển thị số đếm trực tiếp khi chưa có bản chụp thống kê.
 */
export async function captureLegacyStats(client: Client, contest: ContestRow): Promise<LegacyStats | null> {
  const [summary, votes, snaps, awards] = await Promise.all([
    client.rpc("get_contest_summaries", { p_contest_ids: [contest.id] }),
    client.from("contest_votes").select("id", { count: "exact", head: true }).eq("contest_id", contest.id),
    client.from("contest_submission_snapshots").select("total_words").eq("contest_id", contest.id).eq("reason", "submission_closed"),
    client.from("contest_awards").select("id", { count: "exact", head: true }).eq("contest_id", contest.id).is("revoked_at", null),
  ]);
  const failed = summary.error ?? votes.error ?? snaps.error ?? awards.error;
  if (failed) {
    console.error("[contests] capture legacy stats failed:", failed);
    return null;
  }
  const stats: LegacyStats = {
    entries: summary.data?.[0]?.entry_count ?? 0,
    authors: summary.data?.[0]?.author_count ?? 0,
    valid_votes: votes.count ?? 0,
    words: (snaps.data ?? []).reduce((n, x) => n + x.total_words, 0),
    awards: awards.count ?? 0,
    captured_at: new Date().toISOString(),
  };
  const { error } = await client.from("contests").update({ legacy_stats: stats }).eq("id", contest.id);
  if (error) console.error("[contests] save legacy stats failed:", error);
  return stats;
}
