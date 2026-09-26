/**
 * Dữ liệu cuộc thi phía tác giả: section "Cuộc thi" trong /author/[bookId],
 * trang /author/contests (portfolio), và khoá giá chương / độc quyền cho
 * trình soạn chương (D8, D11). Không lưu gì vào books — mọi trạng thái suy ra
 * từ contest_submissions.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContestReviewFlag, ContestStatus, ContestSubmissionStatus, Database } from "@/lib/supabase/types";
import { areResultsVisible, isSubmissionOpen, type ContestCapabilities } from "@/lib/contests/capabilities";
import { readContestConfig } from "@/lib/contests/config";
import { capabilitiesFor, getContestViewer, type ContestRow } from "@/lib/contests/contest-service";
import { evaluateEligibility } from "@/lib/contests/eligibility/engine";
import type { EligibilityResult } from "@/lib/contests/eligibility/types";
import { throwIfError } from "@/lib/contests/errors";
import { loadEligibilityContexts } from "@/lib/contests/submission-service";

type Client = SupabaseClient<Database>;

const ACTIVE: ContestSubmissionStatus[] = ["submitted", "eligible", "shortlisted"];
const FINISHED: ContestStatus[] = ["results", "archived"];

export type ContestBrief = Pick<ContestRow, "id" | "slug" | "title" | "status" | "submission_end" | "voting_start" | "key_visual_url" | "rules_version"> & {
  allow_resubmit_after_withdraw: boolean;
};

function brief(c: ContestRow): ContestBrief {
  return {
    allow_resubmit_after_withdraw: readContestConfig(c).eligibility.allow_resubmit_after_withdraw,
    id: c.id,
    slug: c.slug,
    title: c.title,
    status: c.status,
    submission_end: c.submission_end,
    voting_start: c.voting_start,
    key_visual_url: c.key_visual_url,
    rules_version: c.rules_version,
  };
}

export type AuthorEntry = {
  submission_id: string;
  book_id: string;
  book_title: string;
  contest: ContestBrief;
  status: ContestSubmissionStatus;
  status_reason: string | null;
  submitted_at: string;
  revision_flags: Pick<ContestReviewFlag, "id" | "message" | "fix_by">[];
  capabilities: Pick<ContestCapabilities, "can_withdraw" | "can_edit_submission" | "needs_revision" | "revision_deadline" | "rankings_visible" | "popular_values_visible" | "results_visible">;
  /** Hạng Độc giả yêu thích (khi BXH đã mở và bài nằm trong top 100); null nếu chưa có. */
  popular_rank: number | null;
  awards: { award_name: string; revoked: boolean }[];
};

/** Bài của tác giả (theo sách hoặc tất cả), kèm capability từng bài. */
async function loadAuthorEntries(client: Client, input: { viewerId: string; bookId?: string; now: Date }): Promise<AuthorEntry[]> {
  let query = client
    .from("contest_submissions")
    .select("id, contest_id, book_id, status, status_reason, review_flags, submitted_at")
    .eq("author_id", input.viewerId)
    .order("submitted_at", { ascending: false });
  if (input.bookId) query = query.eq("book_id", input.bookId);
  const { data: subs, error } = await query;
  throwIfError(error, "load author entries");
  if (!subs?.length) return [];

  const contestIds = [...new Set(subs.map((s) => s.contest_id))];
  const [contests, books, awards, viewer] = await Promise.all([
    client.from("contests").select("*").in("id", contestIds),
    client.from("books").select("id, title").in("id", [...new Set(subs.map((s) => s.book_id))]),
    client.from("contest_awards").select("submission_id, award_name, revoked_at").in("submission_id", subs.map((s) => s.id)),
    getContestViewer(client, input.viewerId),
  ]);
  throwIfError(contests.error, "load contests");
  throwIfError(books.error, "load books");
  throwIfError(awards.error, "load awards");
  const contestById = new Map((contests.data ?? []).map((c) => [c.id, c]));
  const titleByBook = new Map((books.data ?? []).map((b) => [b.id, b.title]));

  // Hạng: 1 lần get_contest_ranking (top 100) cho mỗi cuộc thi có BXH đang mở.
  const rankBySubmission = new Map<string, number>();
  await Promise.all(
    (contests.data ?? []).map(async (c) => {
      const caps = capabilitiesFor(c, viewer, null, input.now);
      if (!caps.rankings_visible.popular) return;
      const { data, error: rankError } = await client.rpc("get_contest_ranking", { p_contest_id: c.id, p_limit: 100 });
      throwIfError(rankError, "get_contest_ranking");
      for (const r of data ?? []) rankBySubmission.set(r.submission_id, r.rank);
    })
  );

  return subs.map((s) => {
    const c = contestById.get(s.contest_id)!;
    const flags = s.review_flags as ContestReviewFlag[];
    const caps = capabilitiesFor(c, viewer, { status: s.status, review_flags: flags }, input.now);
    const resultsVisible = areResultsVisible(c, input.now);
    return {
      submission_id: s.id,
      book_id: s.book_id,
      book_title: titleByBook.get(s.book_id) ?? "—",
      contest: brief(c),
      status: s.status,
      status_reason: s.status_reason,
      submitted_at: s.submitted_at,
      revision_flags: flags.filter((f) => f.visible_to_author && f.resolved_at === null).map((f) => ({ id: f.id, message: f.message, fix_by: f.fix_by })),
      capabilities: {
        can_withdraw: caps.can_withdraw,
        can_edit_submission: caps.can_edit_submission,
        needs_revision: caps.needs_revision,
        revision_deadline: caps.revision_deadline,
        rankings_visible: caps.rankings_visible,
        popular_values_visible: caps.popular_values_visible,
        results_visible: caps.results_visible,
      },
      popular_rank: rankBySubmission.get(s.id) ?? null,
      awards: resultsVisible
        ? (awards.data ?? []).filter((a) => a.submission_id === s.id).map((a) => ({ award_name: a.award_name, revoked: a.revoked_at !== null }))
        : [],
    };
  });
}

export type OpenContestForBook = { contest: ContestBrief; eligibility: EligibilityResult };

export type BookContestPanel = {
  entries: AuthorEntry[];
  /** Cuộc thi đang nhận bài mà sách chưa dự (hoặc đã rút — có thể gửi lại). */
  open: OpenContestForBook[];
  locks: BookContestLocks;
};

/**
 * Section "Cuộc thi" của 1 truyện. Số cuộc thi đang nhận bài cùng lúc nhỏ,
 * nên eligibility được tính từng cuộc thi (mỗi lần là 1 lượt nạp theo lô).
 */
export async function getBookContestPanel(client: Client, input: { bookId: string; viewerId: string; now?: Date }): Promise<BookContestPanel> {
  const now = input.now ?? new Date();
  const [entries, openRows] = await Promise.all([
    loadAuthorEntries(client, { viewerId: input.viewerId, bookId: input.bookId, now }),
    client.from("contests").select("*").eq("status", "submission_open").gt("submission_end", now.toISOString()).order("submission_end"),
  ]);
  throwIfError(openRows.error, "load open contests");

  const entered = new Map(entries.map((e) => [e.contest.id, e.status]));
  const candidates = (openRows.data ?? []).filter(
    (c) => isSubmissionOpen(c, now) && (!entered.has(c.id) || entered.get(c.id) === "withdrawn")
  );
  const open = await Promise.all(
    candidates.map(async (c) => {
      const [ctx] = await loadEligibilityContexts(client, { contest: c, viewerId: input.viewerId, bookIds: [input.bookId], now });
      return { contest: brief(c), eligibility: ctx ? evaluateEligibility(ctx, "preview") : { eligible: false, checks: [] } };
    })
  );
  return { entries, open, locks: await getBookContestLocks(client, input.bookId) };
}

export type BookContestLocks = {
  /** D8 — đang dự thi: mọi chương phải miễn phí đến khi công bố kết quả. */
  prices: string | null;
  /** D11 — đang dự cuộc thi yêu cầu độc quyền: không tắt được độc quyền. */
  exclusive: string | null;
};

/** Khoá cho form giá chương / nút độc quyền — cùng điều kiện với 2 trigger trong DB. */
export async function getBookContestLocks(client: Client, bookId: string): Promise<BookContestLocks> {
  const { data: subs, error } = await client.from("contest_submissions").select("contest_id, status").eq("book_id", bookId).in("status", ACTIVE);
  throwIfError(error, "load book locks");
  if (!subs?.length) return { prices: null, exclusive: null };
  const { data: contests, error: cError } = await client
    .from("contests")
    .select("id, title, status, eligibility_rules, vote_rules, scoring_config")
    .in("id", subs.map((s) => s.contest_id));
  throwIfError(cError, "load lock contests");
  const active = (contests ?? []).filter((c) => !FINISHED.includes(c.status));
  if (active.length === 0) return { prices: null, exclusive: null };
  const exclusive = active.filter((c) => readContestConfig(c).eligibility.require_exclusive);
  return {
    prices: `Truyện đang dự thi "${active.map((c) => c.title).join('", "')}" — mọi chương phải miễn phí (cả giá đọc và giá audio) đến khi công bố kết quả.`,
    exclusive: exclusive.length
      ? `Truyện đang dự "${exclusive.map((c) => c.title).join('", "')}" — cuộc thi yêu cầu Độc quyền trên Vịnh, không tắt được đến khi công bố kết quả.`
      : null,
  };
}

/** /author/contests — Đang tham gia / Đã kết thúc. */
export async function listAuthorContests(client: Client, input: { viewerId: string; now?: Date }) {
  const entries = await loadAuthorEntries(client, { viewerId: input.viewerId, now: input.now ?? new Date() });
  const active = entries.filter((e) => !FINISHED.includes(e.contest.status));
  const completed = entries.filter((e) => FINISHED.includes(e.contest.status));
  return {
    active,
    completed,
    totals: {
      contests: new Set(entries.map((e) => e.contest.id)).size,
      awards: entries.reduce((n, e) => n + e.awards.filter((a) => !a.revoked).length, 0),
    },
  };
}
