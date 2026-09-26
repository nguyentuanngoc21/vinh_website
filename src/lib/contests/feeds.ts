/**
 * Feed bài dự thi và BXH cho microsite + hub (mục VII.2–VII.3, Q3).
 *
 *   - "Top truyện" (top) = BXH Độc giả yêu thích: mở từ lúc bình chọn, có
 *     hạng; số phiếu ẩn cho đến khi hết khung bình chọn.
 *   - "Mới tham gia" (new), "Truyện đề xuất" (discover, ngẫu nhiên có seed),
 *     A–Z (az) cho tab Bài dự thi.
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
  /** null khi số phiếu đang ẩn (trong khung bình chọn — Q3). */
  votes: number | null;
  book: HomepageBook;
};

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

/** BXH Độc giả yêu thích (popular-v1). Các loại khác mở ở Phase 2. */
export async function getPopularRanking(
  client: Client,
  input: { contest: ContestRow; capabilities: ContestCapabilities; cursor?: string | null; limit?: number }
): Promise<{ items: RankingEntry[]; next_cursor: string | null; values_visible: boolean }> {
  if (!input.capabilities.rankings_visible.popular) throw new ContestError("ranking_not_visible");
  const cursor = decodeRankingCursor(input.cursor);
  if (cursor === "invalid") throw new ContestError("invalid_cursor");
  const limit = clampLimit(input.limit, 20);

  const { data, error } = await client.rpc("get_contest_ranking", {
    p_contest_id: input.contest.id,
    p_limit: limit,
    p_after_rank: cursor?.rank ?? null,
    p_after_submitted_at: cursor?.submitted_at ?? null,
    p_after_id: cursor?.id ?? null,
  });
  throwIfError(error, "get_contest_ranking");
  const rows = data ?? [];
  const cards = await cardsFor(client, rows.map((r) => r.book_id));
  const valuesVisible = input.capabilities.popular_values_visible;

  const items: RankingEntry[] = [];
  for (const r of rows) {
    const book = cards.get(r.book_id);
    if (!book) continue;
    items.push({ submission_id: r.submission_id, rank: r.rank, tied: r.tied, votes: valuesVisible ? r.value : null, book });
  }
  const last = rows[rows.length - 1];
  return {
    items,
    // Cursor theo hạng (không mang số phiếu) → phân trang được cả lúc số phiếu đang ẩn.
    next_cursor:
      rows.length === limit && last
        ? encodeRankingCursor({ rank: last.rank, submitted_at: last.submitted_at, id: last.submission_id })
        : null,
    values_visible: valuesVisible,
  };
}

/** Khối "Top truyện" trên microsite (Q3). */
export function getTopEntries(client: Client, input: { contest: ContestRow; capabilities: ContestCapabilities }) {
  return getPopularRanking(client, { ...input, limit: TOP_ENTRIES_COUNT });
}
