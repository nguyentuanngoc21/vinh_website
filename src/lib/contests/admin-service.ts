/**
 * Nghiệp vụ trang quản trị cuộc thi (/admin/cuoc-thi). Mọi hàm nhận
 * service-role client + adminId đã được route xác thực bằng
 * getAuthedAdminId(); các RPC còn kiểm lại quyền admin trong DB.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContestStatus, ContestSubmissionStatus, Database } from "@/lib/supabase/types";
import { validateTimeline, type AwardInput, type ContestPatch } from "@/lib/contests/admin-input";
import { areResultsVisible } from "@/lib/contests/capabilities";
import type { ContestRow } from "@/lib/contests/contest-service";
import { ContestError, throwIfError } from "@/lib/contests/errors";
import { getScoreState, getSubmissionScores, type SubmissionScores } from "@/lib/contests/scores-service";

type Client = SupabaseClient<Database>;
type SubmissionRow = Database["public"]["Tables"]["contest_submissions"]["Row"];
type AwardRow = Database["public"]["Tables"]["contest_awards"]["Row"];

/** Trạng thái được phép trao giải: sau khi đóng nhận bài, trước khi lưu trữ. */
const AWARDABLE: ContestStatus[] = ["submission_closed", "community_voting", "judging", "results"];

export async function getContestById(client: Client, contestId: string): Promise<ContestRow> {
  const { data, error } = await client.from("contests").select("*").eq("id", contestId).maybeSingle();
  throwIfError(error, "getContestById");
  if (!data) throw new ContestError("contest_not_found");
  return data;
}

export async function listContestsForAdmin(client: Client) {
  const { data, error } = await client.from("contests").select("*").order("created_at", { ascending: false });
  throwIfError(error, "listContestsForAdmin");
  const rows = data ?? [];
  const counts = new Map<string, number>();
  if (rows.length) {
    const summaries = await client.rpc("get_contest_summaries", { p_contest_ids: rows.map((c) => c.id) });
    throwIfError(summaries.error, "get_contest_summaries");
    for (const s of summaries.data ?? []) counts.set(s.contest_id, s.entry_count);
  }
  return rows.map((c) => ({ ...c, entry_count: counts.get(c.id) ?? 0 }));
}

function timelineErrorsOrThrow(merged: Parameters<typeof validateTimeline>[0]) {
  const errors = validateTimeline(merged);
  if (errors.length) throw new ContestError("invalid_input", errors);
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

export async function createContest(client: Client, adminId: string, patch: ContestPatch): Promise<ContestRow> {
  timelineErrorsOrThrow(patch);
  const { data, error } = await client
    .from("contests")
    .insert({ ...patch, created_by: adminId })
    .select("*")
    .single();
  if (isUniqueViolation(error)) throw new ContestError("slug_taken");
  throwIfError(error, "createContest");
  return data!;
}

/** Thể lệ/slug/cấu hình khoá khi rời draft — trigger trả rules_locked (409). */
export async function updateContest(client: Client, contestId: string, patch: ContestPatch): Promise<ContestRow> {
  const current = await getContestById(client, contestId);
  timelineErrorsOrThrow({ ...current, ...patch });
  const { data, error } = await client.from("contests").update(patch).eq("id", contestId).select("*").single();
  if (isUniqueViolation(error)) throw new ContestError("slug_taken");
  throwIfError(error, "updateContest");
  return data!;
}

/** Chỉ xoá được nháp — trigger contests_prevent_delete chặn phần còn lại. */
export async function deleteDraftContest(client: Client, contestId: string): Promise<void> {
  await getContestById(client, contestId);
  const { error } = await client.from("contests").delete().eq("id", contestId);
  throwIfError(error, "deleteDraftContest");
}

// Chuyển trạng thái + việc đi kèm (nhắc khi mở, chụp bản dự thi khi đóng)
// nằm ở lifecycle-service — dùng chung với cron.
export { notifyOpenReminders, transitionContest } from "@/lib/contests/lifecycle-service";

export async function getStatusEvents(client: Client, contestId: string) {
  const { data, error } = await client
    .from("contest_status_events")
    .select("*")
    .eq("contest_id", contestId)
    .order("created_at", { ascending: true });
  throwIfError(error, "getStatusEvents");
  return data ?? [];
}

export type AdminSubmission = SubmissionRow & {
  book_title: string;
  book_slug: string;
  /** Suy ra từ books.deleted_at — không lưu thành cờ (XII.2). */
  book_removed: boolean;
  author_name: string;
  /** Bảng điểm cache (Slice 2.2) — null khi chưa tính lần nào. Admin luôn
   * thấy số phiếu (kể cả lúc đang ẩn với công chúng) để xét gian lận / trao giải. */
  scores: SubmissionScores | null;
};

export async function listSubmissionsForAdmin(
  client: Client,
  input: { contestId: string; status?: ContestSubmissionStatus | null; flaggedOnly?: boolean; page?: number; pageSize?: number }
): Promise<{ items: AdminSubmission[]; total: number; scores_refreshed_at: string | null }> {
  const pageSize = Math.min(Math.max(input.pageSize ?? 50, 1), 200);
  const page = Math.max(input.page ?? 1, 1);
  let query = client
    .from("contest_submissions")
    .select("*", { count: "exact" })
    .eq("contest_id", input.contestId)
    .order("submitted_at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (input.status) query = query.eq("status", input.status);
  if (input.flaggedOnly) query = query.filter("review_flags", "neq", "[]");
  const { data, error, count } = await query;
  throwIfError(error, "listSubmissionsForAdmin");

  const rows = data ?? [];
  const bookIds = [...new Set(rows.map((r) => r.book_id))];
  const authorIds = [...new Set(rows.map((r) => r.author_id))];
  const [books, authors, scores, scoreState] = await Promise.all([
    bookIds.length ? client.from("books").select("id, title, slug, deleted_at").in("id", bookIds) : Promise.resolve({ data: [], error: null }),
    authorIds.length ? client.from("profiles").select("id, nickname, username").in("id", authorIds) : Promise.resolve({ data: [], error: null }),
    getSubmissionScores(client, rows.map((r) => r.id)),
    getScoreState(client, input.contestId),
  ]);
  throwIfError(books.error, "load books");
  throwIfError(authors.error, "load authors");
  const bookById = new Map((books.data ?? []).map((b) => [b.id, b]));
  const authorById = new Map((authors.data ?? []).map((a) => [a.id, a]));

  return {
    total: count ?? rows.length,
    scores_refreshed_at: scoreState?.refreshed_at ?? null,
    items: rows.map((r) => {
      const b = bookById.get(r.book_id);
      const a = authorById.get(r.author_id);
      return {
        ...r,
        book_title: b?.title ?? "—",
        book_slug: b?.slug ?? "",
        book_removed: Boolean(b?.deleted_at),
        author_name: a?.nickname ?? a?.username ?? "—",
        scores: scores.get(r.id) ?? null,
      };
    }),
  };
}

async function submissionInContest(client: Client, contestId: string, submissionId: string): Promise<SubmissionRow> {
  const { data, error } = await client
    .from("contest_submissions")
    .select("*")
    .eq("id", submissionId)
    .eq("contest_id", contestId)
    .maybeSingle();
  throwIfError(error, "submissionInContest");
  if (!data) throw new ContestError("submission_not_found");
  return data;
}

export async function setSubmissionStatusAsAdmin(
  client: Client,
  input: { contestId: string; submissionId: string; to: ContestSubmissionStatus; adminId: string; reason: string | null }
): Promise<SubmissionRow> {
  await submissionInContest(client, input.contestId, input.submissionId);
  const { data, error } = await client.rpc("set_contest_submission_status", {
    p_submission_id: input.submissionId,
    p_to: input.to,
    p_actor_id: input.adminId,
    p_actor_kind: "admin",
    p_reason: input.reason,
  });
  throwIfError(error, "set_contest_submission_status");
  return data as SubmissionRow;
}

export async function addReviewFlag(
  client: Client,
  input: { contestId: string; submissionId: string; adminId: string; code: string; message: string; fixBy: string | null; visibleToAuthor: boolean }
): Promise<SubmissionRow> {
  await submissionInContest(client, input.contestId, input.submissionId);
  const { data, error } = await client.rpc("add_contest_review_flag", {
    p_submission_id: input.submissionId,
    p_admin_id: input.adminId,
    p_code: input.code,
    p_message: input.message,
    p_fix_by: input.fixBy,
    p_visible_to_author: input.visibleToAuthor,
  });
  throwIfError(error, "add_contest_review_flag");
  return data as SubmissionRow;
}

export async function resolveReviewFlag(
  client: Client,
  input: { contestId: string; submissionId: string; flagId: string; adminId: string; resolution: "fixed" | "dismissed" | "escalated" }
): Promise<SubmissionRow> {
  await submissionInContest(client, input.contestId, input.submissionId);
  const { data, error } = await client.rpc("resolve_contest_review_flag", {
    p_submission_id: input.submissionId,
    p_flag_id: input.flagId,
    p_admin_id: input.adminId,
    p_resolution: input.resolution,
  });
  throwIfError(error, "resolve_contest_review_flag");
  return data as SubmissionRow;
}

export type AdminAward = AwardRow & { book_title: string; author_name: string };

export async function listAwards(client: Client, contestId: string): Promise<AdminAward[]> {
  const { data, error } = await client
    .from("contest_awards")
    .select("*")
    .eq("contest_id", contestId)
    .order("award_rank", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  throwIfError(error, "listAwards");
  const awards = data ?? [];
  if (awards.length === 0) return [];

  const { data: subs, error: subsError } = await client
    .from("contest_submissions")
    .select("id, book_id, author_id")
    .in("id", awards.map((a) => a.submission_id));
  throwIfError(subsError, "load award submissions");
  const [books, authors] = await Promise.all([
    client.from("books").select("id, title").in("id", (subs ?? []).map((x) => x.book_id)),
    client.from("profiles").select("id, nickname").in("id", (subs ?? []).map((x) => x.author_id)),
  ]);
  throwIfError(books.error, "load award books");
  throwIfError(authors.error, "load award authors");
  const subById = new Map((subs ?? []).map((x) => [x.id, x]));
  const titleByBook = new Map((books.data ?? []).map((b) => [b.id, b.title]));
  const nameByAuthor = new Map((authors.data ?? []).map((a) => [a.id, a.nickname]));

  return awards.map((a) => {
    const sub = subById.get(a.submission_id);
    return {
      ...a,
      book_title: (sub && titleByBook.get(sub.book_id)) ?? "—",
      author_name: (sub && nameByAuthor.get(sub.author_id)) ?? "—",
    };
  });
}

export async function createAward(client: Client, input: { contest: ContestRow; adminId: string; award: AwardInput }): Promise<AwardRow> {
  if (!AWARDABLE.includes(input.contest.status)) throw new ContestError("not_allowed");
  const sub = await submissionInContest(client, input.contest.id, input.award.submission_id);
  if (sub.status !== "eligible" && sub.status !== "shortlisted") throw new ContestError("entry_not_votable");
  const { data, error } = await client
    .from("contest_awards")
    .insert({ ...input.award, contest_id: input.contest.id, created_by: input.adminId })
    .select("*")
    .single();
  if (isUniqueViolation(error)) throw new ContestError("award_exists");
  throwIfError(error, "createAward");
  return data!;
}

async function awardInContest(client: Client, contestId: string, awardId: string): Promise<AwardRow> {
  const { data, error } = await client.from("contest_awards").select("*").eq("id", awardId).eq("contest_id", contestId).maybeSingle();
  throwIfError(error, "awardInContest");
  if (!data) throw new ContestError("award_not_found");
  return data;
}

/** Xoá chỉ khi chưa công bố và chưa chi — sau đó phải thu hồi để giữ provenance. */
export async function deleteAward(client: Client, input: { contest: ContestRow; awardId: string }): Promise<void> {
  const award = await awardInContest(client, input.contest.id, input.awardId);
  if (award.paid_at || areResultsVisible(input.contest, new Date()) || input.contest.status === "archived") {
    throw new ContestError("award_locked");
  }
  const { error } = await client.from("contest_awards").delete().eq("id", award.id);
  throwIfError(error, "deleteAward");
}

export async function revokeAward(client: Client, input: { contest: ContestRow; awardId: string; adminId: string; reason: string }): Promise<AwardRow> {
  const award = await awardInContest(client, input.contest.id, input.awardId);
  if (award.revoked_at) throw new ContestError("no_change");
  const { data, error } = await client
    .from("contest_awards")
    .update({ revoked_at: new Date().toISOString(), revoked_by: input.adminId, revoked_reason: input.reason })
    .eq("id", award.id)
    .select("*")
    .single();
  throwIfError(error, "revokeAward");
  return data!;
}

/** D10 / Q6 — chi trả thủ công 1 giải vào ví tác giả qua grant_platform_bonus(). */
export async function payAward(client: Client, input: { contestId: string; awardId: string; adminId: string }): Promise<AwardRow> {
  await awardInContest(client, input.contestId, input.awardId);
  const { data, error } = await client.rpc("pay_contest_award", { p_award_id: input.awardId, p_admin_id: input.adminId });
  throwIfError(error, "pay_contest_award");
  return data as AwardRow;
}
