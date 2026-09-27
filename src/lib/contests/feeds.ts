/**
 * Feed bài dự thi và BXH cho microsite + hub (mục VII.2–VII.3, Q3).
 *
 *   - "Top truyện" (top) = BXH Độc giả yêu thích: mở từ lúc bình chọn, có
 *     hạng; số phiếu ẩn cho đến khi hết khung bình chọn.
 *   - "Mới tham gia" (new), "Truyện đề xuất" (discover, ngẫu nhiên có seed),
 *     A–Z (az) cho tab Bài dự thi.
 *   - Phase 2 (Slice 2.3), đọc bảng điểm cache: "Đang được chú ý" (độc giả
 *     hợp lệ), "Đang tăng tốc" + BXH Trending (độc giả mới 7 ngày, P4),
 *     "Viên ngọc ẩn" (80/20, P5). Không hiển thị điểm; chỉ chip % tăng.
 *     Người gọi làm mới bảng điểm (ensureFreshScores) trước khi đọc.
 *
 * SQL trả thứ tự + hạng + trạng thái bình chọn của người xem theo lô; thẻ
 * truyện (tác giả, số chương, bìa) dựng bằng toHomepageBooks() dùng chung
 * với trang chủ — không truy vấn từng bài.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContestSubmissionStatus, Database } from "@/lib/supabase/types";
import { getEntryVoteState, type ContestCapabilities } from "@/lib/contests/capabilities";
import { readContestConfig, TOP_ENTRIES_COUNT } from "@/lib/contests/config";
import type { ContestRow } from "@/lib/contests/contest-service";
import { ContestError, throwIfError } from "@/lib/contests/errors";
import {
  decodeFeedCursor,
  decodeRankingCursor,
  discoverSeed,
  encodeFeedCursor,
  encodeRankingCursor,
} from "@/lib/contests/ranking";
import { toHomepageBooks, type HomepageBook } from "@/lib/home/get-homepage-books";
import { freezeScores, getScoreState, getSubmissionScores } from "@/lib/contests/scores-service";
import { getPublishedRun } from "@/lib/contests/final-scoring-service";
import { HIDDEN_GEM_COUNT, pickHiddenGems, trendingGrowth, type TrendingGrowth } from "@/lib/contests/signals";

type Client = SupabaseClient<Database>;
type BookRow = Database["public"]["Tables"]["books"]["Row"];

export type EntrySort = "new" | "discover" | "az";
const MAX_LIMIT = 50;

export type EntryVote = ReturnType<typeof getEntryVoteState>;

export type EntryCard = {
  submission_id: string;
  contest_id: string;
  submitted_at: string;
  book: HomepageBook;
  /** null ở hub (gộp nhiều cuộc thi — mỗi cuộc thi một luật bình chọn). */
  vote: EntryVote | null;
};

export type RankingEntry = {
  submission_id: string;
  rank: number;
  tied: boolean;
  /** popular: số phiếu — null khi đang ẩn (trong khung bình chọn, Q3). trending: độc giả mới 7 ngày. */
  value: number | null;
  /** Chỉ BXH Trending: % tăng so với 7 ngày trước đó (P4). */
  growth: TrendingGrowth | null;
  book: HomepageBook;
};

export type RankingPage = { items: RankingEntry[]; next_cursor: string | null; values_visible: boolean };

export type SignalCard = { submission_id: string; book: HomepageBook; growth: TrendingGrowth | null };

function clampLimit(limit: number | undefined, fallback: number): number {
  return Math.min(Math.max(Math.trunc(limit ?? fallback), 1), MAX_LIMIT);
}

/** Thẻ truyện theo đúng thứ tự bookIds; bỏ sách không còn đọc được. */
async function cardsFor(client: Client, bookIds: string[]): Promise<Map<string, HomepageBook>> {
  if (bookIds.length === 0) return new Map();
  const { data, error } = await client.from("books").select("*").in("id", bookIds);
  throwIfError(error, "load entry books");
  const cards = await toHomepageBooks(client, (data ?? []) as BookRow[]);
  return new Map(cards.map((c) => [c.id, c]));
}

export async function getContestEntries(
  client: Client,
  input: {
    /** null = hub (mọi cuộc thi công khai đang diễn ra). */
    contest: ContestRow | null;
    capabilities: ContestCapabilities | null;
    sort: EntrySort;
    genre?: string | null;
    cursor?: string | null;
    limit?: number;
    viewerId: string | null;
    now?: Date;
  }
): Promise<{ items: EntryCard[]; next_cursor: string | null }> {
  const cursor = decodeFeedCursor(input.cursor);
  if (cursor === "invalid") throw new ContestError("invalid_cursor");
  const limit = clampLimit(input.limit, 20);

  const { data, error } = await client.rpc("get_contest_entries", {
    p_contest_id: input.contest?.id ?? null,
    p_sort: input.sort,
    p_seed: input.sort === "discover" ? discoverSeed(input.viewerId, input.now ?? new Date()) : null,
    p_genre: input.genre ?? null,
    p_limit: limit,
    p_after_key: cursor?.key ?? null,
    p_after_id: cursor?.id ?? null,
    p_viewer_id: input.viewerId,
  });
  throwIfError(error, "get_contest_entries");
  const rows = data ?? [];
  const cards = await cardsFor(client, rows.map((r) => r.book_id));
  const requireChapter = input.contest ? readContestConfig(input.contest).vote.require_completed_chapter : true;

  const items: EntryCard[] = [];
  for (const r of rows) {
    const book = cards.get(r.book_id);
    if (!book) continue;
    items.push({
      submission_id: r.submission_id,
      contest_id: r.contest_id,
      submitted_at: r.submitted_at,
      book,
      vote:
        input.contest && input.capabilities
          ? getEntryVoteState({
              capabilities: input.capabilities,
              viewerId: input.viewerId,
              entry: { author_id: r.author_id, status: r.status as ContestSubmissionStatus, book_visible: true },
              hasVoted: r.viewer_has_voted,
              hasCompletedChapter: r.viewer_completed_chapter,
              requireCompletedChapter: requireChapter,
            })
          : null,
    });
  }
  const last = rows[rows.length - 1];
  return {
    items,
    next_cursor: rows.length === limit && last ? encodeFeedCursor({ key: last.sort_key, id: last.submission_id }) : null,
  };
}

/**
 * BXH Độc giả yêu thích. Trong lúc bình chọn (và mọi cuộc thi popular-v1):
 * đếm phiếu hợp lệ trực tiếp. popular-v2 sau khi công bố kết quả: phiếu đã
 * lọc trên bảng điểm đã chốt (P3, P8) — cùng số liệu admin dùng để trao giải.
 */
export async function getPopularRanking(
  client: Client,
  input: { contest: ContestRow; capabilities: ContestCapabilities; cursor?: string | null; limit?: number }
): Promise<RankingPage> {
  if (!input.capabilities.rankings_visible.popular) throw new ContestError("ranking_not_visible");
  const cursor = decodeRankingCursor(input.cursor);
  if (cursor === "invalid") throw new ContestError("invalid_cursor");
  const limit = clampLimit(input.limit, 20);
  const page = {
    p_contest_id: input.contest.id,
    p_limit: limit,
    p_after_rank: cursor?.rank ?? null,
    p_after_submitted_at: cursor?.submitted_at ?? null,
    p_after_id: cursor?.id ?? null,
  };

  const { rows } = await popularRankingRows(client, input.contest, input.capabilities, page);
  return toRankingPage(client, rows, { limit, valuesVisible: input.capabilities.popular_values_visible, growth: null });
}

/**
 * Dòng BXH Độc giả yêu thích (chưa kèm thẻ truyện) — chọn nguồn giống bảng
 * công khai: phiếu trực tiếp, hoặc bảng điểm đã chốt với popular-v2 sau công
 * bố. Dùng chung với thống kê tác giả để hạng luôn khớp.
 */
export async function popularRankingRows(
  client: Client,
  contest: ContestRow,
  capabilities: ContestCapabilities,
  page: { p_contest_id: string; p_limit: number; p_after_rank?: number | null; p_after_submitted_at?: string | null; p_after_id?: string | null }
): Promise<{ rows: RankedRpcRow[]; finalScores: boolean }> {
  const finalScores = await ensureFinalScores(client, contest, capabilities);
  const { data, error } = finalScores
    ? await client.rpc("get_contest_score_ranking", { ...page, p_kind: "popular" })
    : await client.rpc("get_contest_ranking", page);
  throwIfError(error, finalScores ? "get_contest_score_ranking" : "get_contest_ranking");
  return { rows: data ?? [], finalScores };
}

type RankedRpcRow = { submission_id: string; book_id: string; value: number; submitted_at: string; rank: number; tied: boolean };

async function toRankingPage(
  client: Client,
  rows: RankedRpcRow[],
  input: { limit: number; valuesVisible: boolean; growth: Map<string, TrendingGrowth | null> | null }
): Promise<RankingPage> {
  const cards = await cardsFor(client, rows.map((r) => r.book_id));
  const items: RankingEntry[] = [];
  for (const r of rows) {
    const book = cards.get(r.book_id);
    if (!book) continue;
    items.push({
      submission_id: r.submission_id,
      rank: r.rank,
      tied: r.tied,
      value: input.valuesVisible ? r.value : null,
      growth: input.growth?.get(r.submission_id) ?? null,
      book,
    });
  }
  const last = rows[rows.length - 1];
  return {
    items,
    // Cursor theo hạng (không mang số phiếu) → phân trang được cả lúc số phiếu đang ẩn.
    next_cursor:
      rows.length === input.limit && last
        ? encodeRankingCursor({ rank: last.rank, submitted_at: last.submitted_at, id: last.submission_id })
        : null,
    values_visible: input.valuesVisible,
  };
}

/**
 * BXH Trending (P4): độc giả hợp lệ mới trong 7 ngày, kèm % tăng. Số độc giả
 * không phải số phiếu nên luôn hiển thị (P9 chỉ ẩn số phiếu).
 */
export async function getTrendingRanking(
  client: Client,
  input: { contest: ContestRow; capabilities: ContestCapabilities; cursor?: string | null; limit?: number }
): Promise<RankingPage> {
  if (!input.capabilities.rankings_visible.trending) throw new ContestError("ranking_not_visible");
  const cursor = decodeRankingCursor(input.cursor);
  if (cursor === "invalid") throw new ContestError("invalid_cursor");
  const limit = clampLimit(input.limit, 20);
  const { data, error } = await client.rpc("get_contest_score_ranking", {
    p_contest_id: input.contest.id,
    p_kind: "trending",
    p_limit: limit,
    p_after_rank: cursor?.rank ?? null,
    p_after_submitted_at: cursor?.submitted_at ?? null,
    p_after_id: cursor?.id ?? null,
  });
  throwIfError(error, "get_contest_score_ranking trending");
  const rows = data ?? [];
  const scores = await getSubmissionScores(client, rows.map((r) => r.submission_id));
  const growth = new Map(
    rows.map((r) => {
      const s = scores.get(r.submission_id);
      return [r.submission_id, s ? trendingGrowth(s.readers_7d, s.readers_prev_7d) : null] as const;
    })
  );
  return toRankingPage(client, rows, { limit, valuesVisible: true, growth });
}

/** Hàng "Đang được chú ý" (attention) / "Đang tăng tốc" (trending) — không hiển thị điểm. */
export async function getSignalRow(
  client: Client,
  input: { contest: ContestRow; kind: "attention" | "trending"; limit?: number }
): Promise<SignalCard[]> {
  const { data, error } = await client.rpc("get_contest_signal_feed", {
    p_contest_id: input.contest.id,
    p_kind: input.kind,
    p_limit: clampLimit(input.limit, 10),
  });
  throwIfError(error, `get_contest_signal_feed ${input.kind}`);
  const rows = data ?? [];
  const cards = await cardsFor(client, rows.map((r) => r.book_id));
  return rows.flatMap((r) => {
    const book = cards.get(r.book_id);
    if (!book) return [];
    const growth = input.kind === "trending" ? trendingGrowth(r.readers_7d, r.readers_prev_7d) : null;
    return [{ submission_id: r.submission_id, book, growth }];
  });
}

/**
 * Hàng "Viên ngọc ẩn" (P5): mỗi ô 80% từ bài ít độc giả hợp lệ, 20% từ bài
 * ngoài top 10 lượt xem; seed theo ngày + người xem như feed đề xuất.
 */
export async function getHiddenGems(
  client: Client,
  input: { contest: ContestRow; viewerId: string | null; now?: Date }
): Promise<SignalCard[]> {
  const seed = `${discoverSeed(input.viewerId, input.now ?? new Date())}:gems`;
  const { data, error } = await client.rpc("get_contest_hidden_gem_pools", {
    p_contest_id: input.contest.id,
    p_seed: seed,
    p_max_readers: readContestConfig(input.contest).scoring.hidden_gem_max_readers,
    p_pool_limit: HIDDEN_GEM_COUNT * 2,
  });
  throwIfError(error, "get_contest_hidden_gem_pools");
  const rows = data ?? [];
  const picked = pickHiddenGems(
    rows.filter((r) => r.pool === "low_readers"),
    rows.filter((r) => r.pool === "low_views"),
    { seed }
  );
  const cards = await cardsFor(client, picked.map((r) => r.book_id));
  return picked.flatMap((r) => {
    const book = cards.get(r.book_id);
    return book ? [{ submission_id: r.submission_id, book, growth: null }] : [];
  });
}

/**
 * true khi BXH Độc giả yêu thích phải đọc bảng điểm đã chốt (popular-v2, đã
 * công bố kết quả). Chưa chốt (lần chốt lúc công bố bị lỗi) → chốt ngay tại
 * đây; nếu vẫn lỗi thì tạm hiển thị phiếu trực tiếp và để cron 0h chốt lại,
 * thay vì làm hỏng trang kết quả.
 */
async function ensureFinalScores(client: Client, contest: ContestRow, capabilities: ContestCapabilities): Promise<boolean> {
  if (readContestConfig(contest).scoring.popular_formula_id !== "popular-v2" || !capabilities.results_visible) return false;
  try {
    const state = await getScoreState(client, contest.id);
    if (!state?.frozen_at) await freezeScores(client, contest.id);
    return true;
  } catch (error) {
    console.error("[contests] freeze scores on read failed:", error);
    return false;
  }
}

/** Khối "Top truyện" trên microsite (Q3). */
export function getTopEntries(client: Client, input: { contest: ContestRow; capabilities: ContestCapabilities }) {
  return getPopularRanking(client, { ...input, limit: TOP_ENTRIES_COUNT });
}

/**
 * BXH "Chung cuộc" / "Ban giám khảo" (Slice 2.6b) — đọc lượt tính ĐANG CÔNG
 * BỐ, chỉ khi kết quả đã hiển thị. Cuộc thi nhỏ (20–30 bài) → trả đủ, không
 * phân trang. Chung cuộc dùng hạng đã lưu (FinalScore + phá hoà J8); Ban giám
 * khảo xếp theo điểm BGK, đồng điểm cùng hạng. null = chưa có lượt công bố.
 */
export async function getScoredRanking(
  client: Client,
  input: { contest: ContestRow; capabilities: ContestCapabilities; kind: "final" | "jury" }
): Promise<RankingPage | null> {
  if (!input.capabilities.rankings_visible[input.kind]) throw new ContestError("ranking_not_visible");
  const run = await getPublishedRun(client, input.contest.id);
  if (!run) return null;
  const { data: snaps, error } = await client
    .from("contest_score_snapshots").select("submission_id, rank, tied, final_score, judge_score, submitted_at").eq("run_id", run.id);
  throwIfError(error, "load published snapshots");
  const rows = snaps ?? [];
  const { data: subs, error: subError } = rows.length
    ? await client.from("contest_submissions").select("id, book_id").in("id", rows.map((r) => r.submission_id))
    : { data: [], error: null };
  throwIfError(subError, "load ranked submissions");
  const bookBySub = new Map((subs ?? []).map((s) => [s.id, s.book_id]));

  let ranked: RankedRpcRow[];
  if (input.kind === "final") {
    ranked = rows
      .map((r) => ({ submission_id: r.submission_id, book_id: bookBySub.get(r.submission_id) ?? "", value: Number(r.final_score), submitted_at: r.submitted_at, rank: r.rank, tied: r.tied }))
      .sort((a, b) => a.rank - b.rank || (a.submission_id < b.submission_id ? -1 : 1));
  } else {
    const sorted = rows
      .map((r) => ({ submission_id: r.submission_id, book_id: bookBySub.get(r.submission_id) ?? "", value: r.judge_score === null ? -1 : Number(r.judge_score), submitted_at: r.submitted_at }))
      .sort((a, b) => b.value - a.value || Date.parse(a.submitted_at) - Date.parse(b.submitted_at) || (a.submission_id < b.submission_id ? -1 : 1));
    // Bài chưa có điểm BGK (chỉ khi cấu hình không bắt buộc đủ phiếu) xếp cuối, hiện 0.
    ranked = sorted.map((r) => ({
      ...r,
      value: Math.max(r.value, 0),
      rank: sorted.findIndex((x) => x.value === r.value) + 1,
      tied: sorted.filter((x) => x.value === r.value).length > 1,
    }));
  }
  const page = await toRankingPage(client, ranked.filter((r) => r.book_id), { limit: ranked.length + 1, valuesVisible: true, growth: null });
  return { ...page, next_cursor: null };
}
