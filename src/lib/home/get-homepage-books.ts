import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookGenre, Database } from "@/lib/supabase/types";
import { resolveBookCoverUrl } from "@/lib/covers/resolve-book-cover";

/**
 * Real, DB-backed shape for the homepage sections (BookCoverflow,
 * HeroTrending, NewWorksGrid, RankingGenres) — replaces the hardcoded
 * mock catalog that used to live in src/lib/books.ts (`books`, `rankings`,
 * `newWorks`). See migrations/20260824_add_book_tags_and_view_count.sql
 * for `view_count`.
 */
export type HomepageBook = {
  id: string;
  slug: string;
  title: string;
  genre: BookGenre | null;
  viewCount: number;
  authorNickname: string | null;
  chapterCount: number;
  coverUrl: string | null;
};

type BookRow = Database["public"]["Tables"]["books"]["Row"];

async function toHomepageBooks(
  supabase: SupabaseClient<Database>,
  rows: BookRow[]
): Promise<HomepageBook[]> {
  if (rows.length === 0) return [];

  const authorIds = [...new Set(rows.map((r) => r.author_id))];
  const bookIds = rows.map((r) => r.id);

  const [{ data: authors }, { data: chapters }, coverUrls] = await Promise.all([
    supabase.from("author_public_profiles").select("id, nickname").in("id", authorIds),
    supabase.from("chapters").select("book_id").eq("published", true).in("book_id", bookIds),
    // 1 request/sách, tái dùng đúng logic resolve bìa thật đang chạy ở
    // /truyen/[slug] (src/lib/covers/resolve-book-cover.ts) — số sách lên
    // trang chủ nhỏ (top vài chục), không cần gộp thành 1 query IN() riêng.
    Promise.all(rows.map((r) => resolveBookCoverUrl(supabase, r))),
  ]);

  const nicknameById = new Map((authors ?? []).map((a) => [a.id, a.nickname]));
  const chapterCountByBook = new Map<string, number>();
  for (const c of chapters ?? []) {
    chapterCountByBook.set(c.book_id, (chapterCountByBook.get(c.book_id) ?? 0) + 1);
  }

  return rows.map((r, i) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    genre: r.genre,
    viewCount: r.view_count,
    authorNickname: nicknameById.get(r.author_id) ?? null,
    chapterCount: chapterCountByBook.get(r.id) ?? 0,
    coverUrl: coverUrls[i],
  }));
}

export type HomepageData = {
  // "Tác phẩm nổi bật tuần này" (book-coverflow.tsx) — sách publish, xếp
  // theo view_count desc (fallback created_at desc khi view_count bằng
  // nhau, vd. toàn 0 lúc catalog còn trống).
  featured: HomepageBook[];
  // Sách #1 trong `featured` — dùng cho hero-trending.tsx. null nếu chưa
  // có sách nào publish.
  trending: HomepageBook | null;
  // "Truyện mới cập nhật" (new-works-grid.tsx) — publish gần đây nhất.
  newest: HomepageBook[];
  // "Bảng xếp hạng tuần" (ranking-genres.tsx) — top 4 của `featured`.
  weeklyRanking: HomepageBook[];
};

const FEATURED_LIMIT = 12;
const NEWEST_LIMIT = 5;
const WEEKLY_RANKING_LIMIT = 4;

export async function getHomepageData(
  supabase: SupabaseClient<Database>
): Promise<HomepageData> {
  const [{ data: byViews }, { data: byNewest }] = await Promise.all([
    supabase
      .from("books")
      .select("*")
      .eq("published", true)
      .order("view_count", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(FEATURED_LIMIT),
    supabase
      .from("books")
      .select("*")
      .eq("published", true)
      .order("created_at", { ascending: false })
      .limit(NEWEST_LIMIT),
  ]);

  const trendingRows = byViews ?? [];
  const newestRows = byNewest ?? [];

  // Dedup trước khi resolve author/chapter/cover — 2 danh sách trên
  // thường lấn nhau (sách mới xuất bản cũng có thể đang trending), gộp
  // lại để mỗi sách chỉ resolve 1 lần.
  const byId = new Map<string, BookRow>();
  for (const row of [...trendingRows, ...newestRows]) byId.set(row.id, row);
  const resolved = await toHomepageBooks(supabase, [...byId.values()]);
  const resolvedById = new Map(resolved.map((b) => [b.id, b]));

  const featured = trendingRows
    .map((r) => resolvedById.get(r.id))
    .filter((b): b is HomepageBook => b !== undefined);
  const newest = newestRows
    .map((r) => resolvedById.get(r.id))
    .filter((b): b is HomepageBook => b !== undefined);

  return {
    featured,
    trending: featured[0] ?? null,
    newest,
    weeklyRanking: featured.slice(0, WEEKLY_RANKING_LIMIT),
  };
}
