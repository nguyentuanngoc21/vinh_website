import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookGenre, Database } from "@/lib/supabase/types";
import { resolveBookCoverUrls } from "@/lib/covers/resolve-book-cover";
import { computeBookStatus, type BookStatus } from "@/lib/story/status";

/**
 * Real, DB-backed shape for the homepage sections (BookCoverflow,
 * HeroTrending, NewWorksGrid, RankingGenres) — replaces the hardcoded
 * mock catalog that used to live in src/lib/books.ts (`books`, `rankings`,
 * `newWorks`). See migrations/archive/20260824_add_book_tags_and_view_count.sql
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
  synopsis: string | null;
  // Cùng quy tắc với trang /truyen/[slug] (src/lib/story/status.ts).
  status: BookStatus;
};

type BookRow = Database["public"]["Tables"]["books"]["Row"];

/** Đúng các cột toHomepageBooks() cần — KHÔNG dùng select("*"): bảng
 * books có cột `embedding vector(1536)` (~15-20 KB JSON/hàng) chỉ dùng
 * cho recommend_books() trong SQL, không bao giờ cần gửi về app. */
export const HOMEPAGE_BOOK_COLUMNS =
  "id, slug, title, genre, view_count, author_id, synopsis, cover_design_item_id, created_at";
export type HomepageBookRow = Pick<
  BookRow,
  "id" | "slug" | "title" | "genre" | "view_count" | "author_id" | "synopsis" | "cover_design_item_id" | "created_at"
>;

/** Exported for reuse by src/lib/recommendations/get-recommended-books.ts
 * — cùng join tác giả/chương/bìa, khác nguồn danh sách sách đầu vào. */
export async function toHomepageBooks(
  supabase: SupabaseClient<Database>,
  rows: HomepageBookRow[]
): Promise<HomepageBook[]> {
  if (rows.length === 0) return [];

  const authorIds = [...new Set(rows.map((r) => r.author_id))];
  const bookIds = rows.map((r) => r.id);

  const [{ data: authors }, { data: chapterStats }, coverUrls] = await Promise.all([
    supabase.from("author_public_profiles").select("id, nickname").in("id", authorIds),
    // 1 hàng/sách (view gộp sẵn, migrations/20260929_add_ranking_aggregates.sql)
    // thay vì mọi hàng chương — không bị giới hạn 1000 hàng của PostgREST cắt.
    supabase
      .from("book_chapter_stats")
      .select("book_id, published_chapter_count, has_published_last_chapter, latest_published_chapter_at")
      .in("book_id", bookIds),
    // 1 query IN() cho cả danh sách (src/lib/covers/resolve-book-cover.ts).
    resolveBookCoverUrls(supabase, rows),
  ]);

  const nicknameById = new Map((authors ?? []).map((a) => [a.id, a.nickname]));
  const statsByBook = new Map((chapterStats ?? []).map((c) => [c.book_id, c]));

  return rows.map((r, i) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    genre: r.genre,
    viewCount: r.view_count,
    authorNickname: nicknameById.get(r.author_id) ?? null,
    chapterCount: statsByBook.get(r.id)?.published_chapter_count ?? 0,
    coverUrl: coverUrls[i],
    synopsis: r.synopsis,
    status: computeBookStatus({
      hasPublishedLastChapter: statsByBook.get(r.id)?.has_published_last_chapter ?? false,
      latestPublishedChapterCreatedAt: statsByBook.get(r.id)?.latest_published_chapter_at ?? null,
    }),
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
      .select(HOMEPAGE_BOOK_COLUMNS)
      .eq("published", true)
      .is("deleted_at", null)
      .order("view_count", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(FEATURED_LIMIT),
    supabase
      .from("books")
      .select(HOMEPAGE_BOOK_COLUMNS)
      .eq("published", true)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(NEWEST_LIMIT),
  ]);

  const trendingRows = byViews ?? [];
  const newestRows = byNewest ?? [];

  // Dedup trước khi resolve author/chapter/cover — 2 danh sách trên
  // thường lấn nhau (sách mới xuất bản cũng có thể đang trending), gộp
  // lại để mỗi sách chỉ resolve 1 lần.
  const byId = new Map<string, HomepageBookRow>();
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
