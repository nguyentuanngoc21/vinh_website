/**
 * Thống kê bài dự thi cho tác giả — /author/contests/[slug]/stats (Phase 2,
 * Slice 2.7). Chỉ tác giả của bài xem được (lọc theo author_id của người xem).
 * Số liệu đọc từ get_contest_entry_stats() + bảng điểm cache (làm mới lười 15
 * phút); ô "Phiếu bình chọn" theo capability (P9 — ẩn số trong lúc bình chọn,
 * vẫn thấy hạng — Q3). Hạng lấy cùng nguồn với BXH công khai.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContestReviewFlag, ContestSubmissionStatus, Database } from "@/lib/supabase/types";
import { capabilitiesFor, getContestBySlug, getContestViewer, type ContestRow } from "@/lib/contests/contest-service";
import { ContestError, throwIfError } from "@/lib/contests/errors";
import { popularRankingRows } from "@/lib/contests/feeds";
import { ensureFreshScores, getSubmissionScores, type ScoreState } from "@/lib/contests/scores-service";
import { parseEntryStats, type EntryStats, type VoteKpi } from "@/lib/contests/stats-view";

type Client = SupabaseClient<Database>;

export type StatsEntryOption = { submission_id: string; book_title: string; status: ContestSubmissionStatus };
export type StatsContestOption = { slug: string; title: string };

export type AuthorContestStats = {
  contest: Pick<ContestRow, "id" | "slug" | "title" | "status" | "voting_start" | "voting_end">;
  entry: StatsEntryOption;
  /** Các bài của tác giả trong cuộc thi này (chip chọn bài khi có > 1). */
  entries: StatsEntryOption[];
  /** Các cuộc thi tác giả đã tham gia (chip chuyển cuộc thi — thiết kế). */
  contests: StatsContestOption[];
  stats: EntryStats;
  votes: VoteKpi;
  scoresRefreshedAt: string | null;
};

export async function getAuthorContestStats(
  client: Client,
  input: { slug: string; viewerId: string; submissionId?: string | null; now?: Date }
): Promise<AuthorContestStats> {
  const now = input.now ?? new Date();
  const contest = await getContestBySlug(client, input.slug);

  const { data: subs, error } = await client
    .from("contest_submissions")
    .select("id, contest_id, book_id, status, review_flags, submitted_at")
    .eq("author_id", input.viewerId)
    .order("submitted_at", { ascending: false });
  throwIfError(error, "load author submissions");
  const mine = subs ?? [];
  const here = mine.filter((s) => s.contest_id === contest.id);
  if (here.length === 0) throw new ContestError("submission_not_found");

  const [books, contests] = await Promise.all([
    client.from("books").select("id, title").in("id", [...new Set(here.map((s) => s.book_id))]),
    client.from("contests").select("id, slug, title").in("id", [...new Set(mine.map((s) => s.contest_id))]).neq("status", "draft"),
  ]);
  throwIfError(books.error, "load entry books");
  throwIfError(contests.error, "load author contests");
  const titleByBook = new Map((books.data ?? []).map((b) => [b.id, b.title]));
  const entries: StatsEntryOption[] = here.map((s) => ({ submission_id: s.id, book_title: titleByBook.get(s.book_id) ?? "—", status: s.status }));
  const picked = here.find((s) => s.id === input.submissionId) ?? here[0];

  const state: ScoreState | null = await ensureFreshScores(client, contest.id);
  const { data: raw, error: statsError } = await client.rpc("get_contest_entry_stats", { p_submission_id: picked.id });
  throwIfError(statsError, "get_contest_entry_stats");

  const viewer = await getContestViewer(client, input.viewerId);
  const capabilities = capabilitiesFor(contest, viewer, { status: picked.status, review_flags: picked.review_flags as ContestReviewFlag[] }, now);
  const votes = await voteKpi(client, contest, capabilities, picked.id);

  return {
    contest: {
      id: contest.id,
      slug: contest.slug,
      title: contest.title,
      status: contest.status,
      voting_start: contest.voting_start,
      voting_end: contest.voting_end,
    },
    entry: entries.find((e) => e.submission_id === picked.id)!,
    entries,
    contests: (contests.data ?? []).map((c) => ({ slug: c.slug, title: c.title })),
    stats: parseEntryStats(raw),
    votes,
    scoresRefreshedAt: state?.refreshed_at ?? null,
  };
}

async function voteKpi(
  client: Client,
  contest: ContestRow,
  capabilities: ReturnType<typeof capabilitiesFor>,
  submissionId: string
): Promise<VoteKpi> {
  if (!capabilities.rankings_visible.popular) return { state: "not_open", opensAt: contest.voting_start };
  const { rows, filtered } = await popularRankingRows(client, contest, capabilities, { p_contest_id: contest.id, p_limit: 100 });
  const rank = rows.find((r) => r.submission_id === submissionId)?.rank ?? null;
  if (!capabilities.popular_values_visible) return { state: "hidden", rank };

  if (filtered) {
    const scores = await getSubmissionScores(client, [submissionId]);
    return { state: "visible", votes: scores.get(submissionId)?.filtered_votes ?? 0, rank };
  }
  const { count, error } = await client
    .from("contest_votes")
    .select("id", { count: "exact", head: true })
    .eq("submission_id", submissionId);
  throwIfError(error, "count entry votes");
  return { state: "visible", votes: count ?? 0, rank };
}
