/**
 * Nộp / xem trước / rút bài dự thi — MỘT service cho cả 2 điểm vào
 * (/cuoc-thi/[slug] › "Gửi tác phẩm dự thi" và /author/[bookId] › Cuộc thi).
 *
 * Luồng nộp: nạp ngữ cảnh 1 lần → chạy đủ rule phase `submit` (không tin kết
 * quả xem trước) → submit_contest_entry() kiểm lại các bất biến có tranh
 * chấp dưới khoá và ghi bài, lưu kết quả engine làm bằng chứng.
 * Không nhận authorId/status/eligibility từ client.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { hasAcceptedExclusivityPolicy } from "@/lib/authoring/exclusivity-agreement";
import { readContestConfig } from "@/lib/contests/config";
import { getContestViewer, type ContestRow } from "@/lib/contests/contest-service";
import { evaluateEligibility } from "@/lib/contests/eligibility/engine";
import type { EligibilityContext, EligibilityResult } from "@/lib/contests/eligibility/types";
import { ContestError, throwIfError } from "@/lib/contests/errors";

type Client = SupabaseClient<Database>;
type SubmissionRow = Database["public"]["Tables"]["contest_submissions"]["Row"];

const ACTIVE = new Set(["submitted", "eligible", "shortlisted"]);
const FINISHED = new Set(["results", "archived"]);

export type BookEligibility = { bookId: string; title: string; result: EligibilityResult };

/**
 * Nạp ngữ cảnh eligibility cho nhiều sách của cùng 1 người xem trong 1 cuộc
 * thi — số truy vấn cố định, không phụ thuộc số sách (không N+1).
 */
export async function loadEligibilityContexts(
  client: Client,
  input: { contest: ContestRow; viewerId: string; bookIds: string[]; acceptedRulesVersion?: string | null; now?: Date }
): Promise<EligibilityContext[]> {
  const { contest, viewerId, bookIds } = input;
  const now = input.now ?? new Date();
  if (bookIds.length === 0) return [];
  const rules = readContestConfig(contest).eligibility;

  const [books, stats, bookSubs, authorSubs, profile, viewer, agreement] = await Promise.all([
    client
      .from("books")
      .select("id, author_id, title, published, deleted_at, genre, tags, is_exclusive, published_at")
      .in("id", bookIds),
    client.rpc("get_books_contest_stats", { p_book_ids: bookIds }),
    client.from("contest_submissions").select("id, contest_id, book_id, status").in("book_id", bookIds),
    client
      .from("contest_submissions")
      .select("book_id, status")
      .eq("contest_id", contest.id)
      .eq("author_id", viewerId),
    client.from("profiles").select("date_of_birth").eq("id", viewerId).maybeSingle(),
    getContestViewer(client, viewerId),
    // Chỉ cần khi cuộc thi yêu cầu độc quyền (D11).
    rules.require_exclusive ? hasAcceptedExclusivityPolicy(client, viewerId) : Promise.resolve(true),
  ]);
  throwIfError(books.error, "load books");
  throwIfError(stats.error, "get_books_contest_stats");
  throwIfError(bookSubs.error, "load book submissions");
  throwIfError(authorSubs.error, "load author submissions");
  throwIfError(profile.error, "load profile");

  // Cuộc thi khác mà các sách đang/đã tham gia, và giải của các sách đó.
  const otherSubs = (bookSubs.data ?? []).filter((s) => s.contest_id !== contest.id);
  const otherContestIds = [...new Set(otherSubs.map((s) => s.contest_id))];
  const [otherContests, awards] = await Promise.all([
    otherContestIds.length
      ? client.from("contests").select("id, title, status, eligibility_rules, vote_rules, scoring_config").in("id", otherContestIds)
      : Promise.resolve({ data: [], error: null }),
    otherSubs.length
      ? client.from("contest_awards").select("submission_id").in("submission_id", otherSubs.map((s) => s.id)).is("revoked_at", null)
      : Promise.resolve({ data: [], error: null }),
  ]);
  throwIfError(otherContests.error, "load other contests");
  throwIfError(awards.error, "load awards");

  const contestById = new Map((otherContests.data ?? []).map((c) => [c.id, c]));
  const awardedSubmissions = new Set((awards.data ?? []).map((a) => a.submission_id));
  const statsByBook = new Map((stats.data ?? []).map((s) => [s.book_id, s]));
  const authorActiveBooks = (authorSubs.data ?? []).filter((s) => ACTIVE.has(s.status)).map((s) => s.book_id);

  return (books.data ?? []).map((book) => {
    const subs = otherSubs.filter((s) => s.book_id === book.id);
    const otherActiveEntries = subs
      .filter((s) => ACTIVE.has(s.status) && !FINISHED.has(contestById.get(s.contest_id)?.status ?? "results"))
      .map((s) => {
        const other = contestById.get(s.contest_id)!;
        return {
          contest_id: other.id,
          contest_title: other.title,
          allow_multi_contest: readContestConfig(other).eligibility.allow_multi_contest,
        };
      });
    const priorFinishedEntries = subs.filter(
      (s) => (s.status === "eligible" || s.status === "shortlisted") && FINISHED.has(contestById.get(s.contest_id)?.status ?? "")
    ).length;
    const own = (bookSubs.data ?? []).find((s) => s.contest_id === contest.id && s.book_id === book.id) ?? null;
    const st = statsByBook.get(book.id);

    return {
      now,
      contest,
      rules,
      viewer: { userId: viewerId, emailVerified: viewer.emailVerified, dateOfBirth: profile.data?.date_of_birth ?? null },
      book,
      stats: {
        published_chapter_count: st?.published_chapter_count ?? 0,
        total_words: st?.total_words ?? 0,
        priced_chapter_count: st?.priced_chapter_count ?? 0,
      },
      exclusivityAgreementAccepted: agreement,
      thisSubmission: own ? { status: own.status } : null,
      otherActiveEntries,
      priorFinishedEntries,
      priorAwards: subs.filter((s) => awardedSubmissions.has(s.id)).length,
      authorOtherActiveEntries: authorActiveBooks.filter((id) => id !== book.id).length,
      acceptedRulesVersion: input.acceptedRulesVersion ?? null,
    } satisfies EligibilityContext;
  });
}

/** Xem trước điều kiện: 1 sách (bookId) hoặc mọi sách chưa xoá của người xem. */
export async function previewEligibility(
  client: Client,
  input: { contest: ContestRow; viewerId: string; bookId?: string | null }
): Promise<BookEligibility[]> {
  let bookIds: string[];
  if (input.bookId) {
    bookIds = [input.bookId];
  } else {
    const { data, error } = await client
      .from("books")
      .select("id")
      .eq("author_id", input.viewerId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    throwIfError(error, "list author books");
    bookIds = (data ?? []).map((b) => b.id);
  }
  const contexts = await loadEligibilityContexts(client, { contest: input.contest, viewerId: input.viewerId, bookIds });
  if (input.bookId && contexts.length === 0) throw new ContestError("book_not_found");
  return contexts.map((ctx) => ({ bookId: ctx.book.id, title: ctx.book.title, result: evaluateEligibility(ctx, "preview") }));
}

export async function submitEntry(
  client: Client,
  input: { contest: ContestRow; viewerId: string; bookId: string; acceptedRulesVersion: string }
): Promise<{ submission: SubmissionRow; eligibility: EligibilityResult }> {
  const [ctx] = await loadEligibilityContexts(client, {
    contest: input.contest,
    viewerId: input.viewerId,
    bookIds: [input.bookId],
    acceptedRulesVersion: input.acceptedRulesVersion,
  });
  if (!ctx) throw new ContestError("book_not_found");

  const eligibility = evaluateEligibility(ctx, "submit");
  if (!eligibility.eligible) throw new ContestError("not_eligible", eligibility);

  const { data, error } = await client.rpc("submit_contest_entry", {
    p_contest_id: input.contest.id,
    p_book_id: input.bookId,
    p_user_id: input.viewerId,
    p_rules_version: input.acceptedRulesVersion,
    p_eligibility_result: eligibility.checks,
  });
  throwIfError(error, "submit_contest_entry");
  return { submission: data as SubmissionRow, eligibility };
}

/** Rút bài của chính mình (D6). Bài phải thuộc đúng cuộc thi trong URL. */
export async function withdrawEntry(
  client: Client,
  input: { contest: ContestRow; viewerId: string; submissionId: string }
): Promise<SubmissionRow> {
  await assertSubmissionInContest(client, input.contest.id, input.submissionId);
  const { data, error } = await client.rpc("set_contest_submission_status", {
    p_submission_id: input.submissionId,
    p_to: "withdrawn",
    p_actor_id: input.viewerId,
    p_actor_kind: "author",
    p_reason: null,
  });
  throwIfError(error, "withdraw");
  return data as SubmissionRow;
}

/** Chặn dùng id bài của cuộc thi khác với slug trên URL. */
export async function assertSubmissionInContest(client: Client, contestId: string, submissionId: string): Promise<void> {
  const { data, error } = await client
    .from("contest_submissions")
    .select("id")
    .eq("id", submissionId)
    .eq("contest_id", contestId)
    .maybeSingle();
  throwIfError(error, "assertSubmissionInContest");
  if (!data) throw new ContestError("submission_not_found");
}
