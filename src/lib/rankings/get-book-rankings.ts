import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookGenre, Database } from "@/lib/supabase/types";
import { resolveBookCoverUrls } from "@/lib/covers/resolve-book-cover";
import type { AgeRating } from "@/lib/age-rating";

/**
 * Real, DB-backed ranking data for the "Truyện chữ" tab of /rankings
 * (rankings-board.tsx) — replaces the hardcoded fake NOVEL bank + seeded
 * scores that used to drive it (src/lib/rankings-data.ts). "Audio" and
 * "Blog" tabs stay on that mock bank: audio_narrations has no play-count
 * column and there's no blog-post table yet, so there's nothing real to
 * connect them to (see the note at the top of docs/supabase/schema.sql —
 * same reasoning the "Blog" section of connect-directory.tsx was removed
 * for instead of shown with fabricated numbers).
 *
 * Deliberately parallel to (not sharing code with) toHomepageBooks() in
 * get-homepage-books.ts: that one resolves a small top-12 subset for the
 * homepage, this one resolves every published book for the full,
 * genre-filterable rankings list.
 *
 * audio_narrations gained genre/play_count since the paragraph above was
 * written (migrations/archive/20260901_add_audio_narration_hub_metadata.sql) —
 * the "Audio" tab COULD be wired to real all-time totals now the same way
 * "toanthoigian" ranks books by view_count. It isn't yet: play_count has
 * no day-bucketed history (no audio equivalent of book_read_counts_daily),
 * so only an all-time board would be real, not week/month/quarter — and
 * "Blog" still has nothing to read at all (no blog_posts table). Left as
 * future work rather than wiring one tab of four.
 *
 * "tuan"/"thang"/"quy" are real, day-bucketed windows over
 * book_read_counts_daily (see migrations/archive/20260831_add_book_read_counts_daily.sql
 * — a public aggregate over reading_history's real read_at). "toanthoigian"
 * ranks by books.view_count, the all-time running total. Every period also
 * gets a real ▲/▼: books are ranked a second time using the equal-length
 * window right before the current one, and the delta is the rank change
 * between those two full rankings (every published book gets both ranks,
 * so the delta is always defined — no fabricated "just entered" numbers).
 * "toanthoigian" has no such window to compare against, so its delta is
 * always null (rendered as "—", never a made-up arrow). `isNew` is real:
 * published since the start of that period's current window (for
 * "toanthoigian", published in the last 7 days).
 */
export type RealPeriodId = "tuan" | "thang" | "quy" | "toanthoigian";

export const REAL_PERIODS: { id: RealPeriodId; label: string }[] = [
  { id: "tuan", label: "Top tuần" },
  { id: "thang", label: "Top tháng" },
  { id: "quy", label: "Top quý" },
  { id: "toanthoigian", label: "Toàn thời gian" },
];

export type RankedBook = {
  id: string;
  slug: string;
  title: string;
  genre: BookGenre | null;
  authorId: string;
  authorNickname: string | null;
  chapterCount: number;
  coverUrl: string | null;
  viewCount: number;
  reads: number;
  delta: number | null;
  isNew: boolean;
  /** books.is_exclusive — tag "Độc quyền" trên card. */
  isExclusive: boolean;
  ageRating: AgeRating;
};

export type RankingLeader = { name: string; meta: string; color: string };

export type RankingPeriodData = {
  range: string;
  list: RankedBook[];
  leaders: RankingLeader[];
};

export type BookRankingsData = Record<RealPeriodId, RankingPeriodData>;

const LEADER_COLORS = [
  "var(--color-chart-indigo)",
  "var(--color-chart-teal)",
  "var(--color-success)",
  "var(--color-chart-orange)",
  "var(--color-chart-pink)",
];
const LEADERS_LIMIT = 5;
const NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type Window = { curStart: Date; curEnd: Date; prevStart: Date; prevEnd: Date; range: string };

function startOfUTCDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}
function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function startOfQuarter(d: Date): Date {
  const q = Math.floor(d.getUTCMonth() / 3);
  return new Date(Date.UTC(d.getUTCFullYear(), q * 3, 1));
}
function fmtDM(d: Date): string {
  return String(d.getUTCDate()).padStart(2, "0") + "/" + String(d.getUTCMonth() + 1).padStart(2, "0");
}
const QUARTER_ROMAN = ["I", "II", "III", "IV"];

function buildWindows(now: Date): Record<Exclude<RealPeriodId, "toanthoigian">, Window> {
  const today = startOfUTCDay(now);

  const weekStart = addDays(today, -6);
  const monthStart = startOfMonth(now);
  const prevMonthStart = startOfMonth(addDays(monthStart, -1));
  const quarterStart = startOfQuarter(now);
  const prevQuarterStart = startOfQuarter(addDays(quarterStart, -1));

  return {
    tuan: {
      curStart: weekStart,
      curEnd: now,
      prevStart: addDays(weekStart, -7),
      prevEnd: weekStart,
      range: fmtDM(weekStart) + " – " + fmtDM(today),
    },
    thang: {
      curStart: monthStart,
      curEnd: now,
      prevStart: prevMonthStart,
      prevEnd: monthStart,
      range: "Tháng " + (now.getUTCMonth() + 1) + " · " + now.getUTCFullYear(),
    },
    quy: {
      curStart: quarterStart,
      curEnd: now,
      prevStart: prevQuarterStart,
      prevEnd: quarterStart,
      range:
        "Quý " + QUARTER_ROMAN[Math.floor(quarterStart.getUTCMonth() / 3)] + " · " + now.getUTCFullYear(),
    },
  };
}

export async function getBookRankings(
  supabase: SupabaseClient<Database>
): Promise<BookRankingsData> {
  const now = new Date();
  const windows = buildWindows(now);

  // Tổng lượt đọc mỗi sách cho từng cửa sổ, gộp sẵn trong SQL
  // (book_read_counts_between, migrations/20260929_add_ranking_aggregates.sql)
  // — trước đây tải mọi hàng theo-ngày của ~6 tháng rồi cộng ở JS, vượt
  // 1000 hàng là PostgREST cắt im lặng.
  const readsBetween = async (from: Date, to: Date) => {
    const { data, error } = await supabase.rpc("book_read_counts_between", {
      p_from: from.toISOString(),
      p_to: to.toISOString(),
    });
    if (error) console.error("[rankings] book_read_counts_between failed:", error);
    return new Map((data ?? []).map((r) => [r.book_id, r.read_count]));
  };
  const periodKeys = ["tuan", "thang", "quy"] as const;

  const [{ data: rows }, periodReads] = await Promise.all([
    supabase
      .from("books")
      .select("id, slug, title, genre, author_id, view_count, created_at, cover_design_item_id, is_exclusive, age_rating")
      .eq("published", true)
      .is("deleted_at", null)
      .order("view_count", { ascending: false })
      .order("created_at", { ascending: false }),
    Promise.all(
      periodKeys.map(async (key) => {
        const w = windows[key];
        const [cur, prev] = await Promise.all([readsBetween(w.curStart, w.curEnd), readsBetween(w.prevStart, w.prevEnd)]);
        return { cur, prev };
      })
    ),
  ]);

  const books = rows ?? [];
  if (books.length === 0) {
    const empty: RankingPeriodData = { range: "", list: [], leaders: [] };
    return {
      tuan: { ...empty, range: windows.tuan.range },
      thang: { ...empty, range: windows.thang.range },
      quy: { ...empty, range: windows.quy.range },
      toanthoigian: { ...empty, range: "Toàn thời gian" },
    };
  }

  const authorIds = [...new Set(books.map((b) => b.author_id))];
  const bookIds = books.map((b) => b.id);

  const [{ data: authors }, { data: chapters }, coverUrls] = await Promise.all([
    supabase.from("author_public_profiles").select("id, nickname").in("id", authorIds),
    supabase.from("book_chapter_stats").select("book_id, published_chapter_count").in("book_id", bookIds),
    resolveBookCoverUrls(supabase, books),
  ]);

  const nicknameById = new Map((authors ?? []).map((a) => [a.id, a.nickname]));
  const chapterCountByBook = new Map((chapters ?? []).map((c) => [c.book_id, c.published_chapter_count]));
  const coverByBook = new Map(books.map((b, i) => [b.id, coverUrls[i]]));

  // sums[period].cur/prev: bookId -> reads within that window.
  const sums: Record<Exclude<RealPeriodId, "toanthoigian">, { cur: Map<string, number>; prev: Map<string, number> }> = {
    tuan: periodReads[0],
    thang: periodReads[1],
    quy: periodReads[2],
  };

  function buildBase() {
    return books.map((b) => ({
      id: b.id,
      slug: b.slug,
      title: b.title,
      genre: b.genre,
      authorId: b.author_id,
      authorNickname: nicknameById.get(b.author_id) ?? null,
      chapterCount: chapterCountByBook.get(b.id) ?? 0,
      coverUrl: coverByBook.get(b.id) ?? null,
      viewCount: b.view_count,
      createdAtMs: new Date(b.created_at).getTime(),
      isExclusive: b.is_exclusive,
      ageRating: b.age_rating,
    }));
  }

  function rankBy(base: ReturnType<typeof buildBase>, readsOf: (id: string) => number): Map<string, number> {
    const sorted = [...base].sort((a, b) => {
      const diff = readsOf(b.id) - readsOf(a.id);
      if (diff !== 0) return diff;
      if (b.viewCount !== a.viewCount) return b.viewCount - a.viewCount;
      return b.createdAtMs - a.createdAtMs;
    });
    return new Map(sorted.map((b, i) => [b.id, i + 1]));
  }

  function leadersFor(base: ReturnType<typeof buildBase>, readsOf: (id: string) => number): RankingLeader[] {
    const totals = new Map<string, { reads: number; count: number }>();
    for (const b of base) {
      const agg = totals.get(b.authorId) ?? { reads: 0, count: 0 };
      agg.reads += readsOf(b.id);
      agg.count += 1;
      totals.set(b.authorId, agg);
    }
    return [...totals.entries()]
      .sort((a, b) => b[1].reads - a[1].reads)
      .slice(0, LEADERS_LIMIT)
      .map(([authorId, agg], i) => ({
        name: nicknameById.get(authorId) ?? "Ẩn danh",
        meta: `${agg.count} tác phẩm · ${agg.reads.toLocaleString("vi-VN")} đọc`,
        color: LEADER_COLORS[i % LEADER_COLORS.length],
      }));
  }

  const base = buildBase();
  const result = {} as BookRankingsData;

  for (const key of ["tuan", "thang", "quy"] as const) {
    const w = windows[key];
    const curReads = (id: string) => sums[key].cur.get(id) ?? 0;
    const prevReads = (id: string) => sums[key].prev.get(id) ?? 0;
    const curRank = rankBy(base, curReads);
    const prevRank = rankBy(base, prevReads);

    const list: RankedBook[] = base
      .map((b) => ({
        id: b.id,
        slug: b.slug,
        title: b.title,
        genre: b.genre,
        authorId: b.authorId,
        authorNickname: b.authorNickname,
        chapterCount: b.chapterCount,
        coverUrl: b.coverUrl,
        viewCount: b.viewCount,
        isExclusive: b.isExclusive,
        ageRating: b.ageRating,
        reads: curReads(b.id),
        delta: (prevRank.get(b.id) ?? 0) - (curRank.get(b.id) ?? 0),
        isNew: b.createdAtMs >= w.curStart.getTime(),
      }))
      .sort((a, b) => (curRank.get(a.id) ?? 0) - (curRank.get(b.id) ?? 0));

    result[key] = { range: w.range, list, leaders: leadersFor(base, curReads) };
  }

  const allTimeReads = (id: string) => base.find((b) => b.id === id)?.viewCount ?? 0;
  result.toanthoigian = {
    range: "Toàn thời gian",
    list: base
      .map((b) => ({
        id: b.id,
        slug: b.slug,
        title: b.title,
        genre: b.genre,
        authorId: b.authorId,
        authorNickname: b.authorNickname,
        chapterCount: b.chapterCount,
        coverUrl: b.coverUrl,
        viewCount: b.viewCount,
        isExclusive: b.isExclusive,
        ageRating: b.ageRating,
        reads: b.viewCount,
        delta: null,
        isNew: now.getTime() - b.createdAtMs < NEW_WINDOW_MS,
      }))
      .sort((a, b) => b.viewCount - a.viewCount),
    leaders: leadersFor(base, allTimeReads),
  };

  return result;
}
