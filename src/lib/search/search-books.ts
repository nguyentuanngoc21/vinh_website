import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookGenre, Database } from "@/lib/supabase/types";
import { resolveBookCoverUrl } from "@/lib/covers/resolve-book-cover";

export type BookSearchResult = {
  id: string;
  slug: string;
  title: string;
  genre: BookGenre | null;
  authorNickname: string | null;
  coverUrl: string | null;
};

const SEARCH_LIMIT = 24;
const BOOK_SEARCH_COLUMNS = "id, slug, title, genre, tags, author_id, cover_design_item_id, view_count, created_at";

type BookSearchRow = {
  id: string;
  slug: string;
  title: string;
  genre: BookGenre | null;
  tags: string[] | null;
  author_id: string;
  cover_design_item_id: string | null;
  view_count: number;
  created_at: string;
};

/** Tìm truyện theo tên, tag, hoặc tên tác giả — chưa có full-text index
 * thật (không có tsvector/pg_trgm trong schema.sql), nên dùng `ilike`
 * (quét tuần tự) cho khối lượng hiện tại. Nếu số sách lớn lên nhiều, nên
 * thêm 1 migration tsvector + GIN index thay vì ilike. 2 truy vấn riêng
 * (theo tên sách, theo tên tác giả) rồi gộp ở JS — không dùng embed
 * PostgREST vì src/lib/supabase/types.ts không khai báo Relationships
 * (đúng convention đang dùng ở nơi khác trong repo, xem
 * get-homepage-books.ts). */
export async function searchBooks(supabase: SupabaseClient<Database>, query: string): Promise<BookSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const likeQ = `%${q}%`;

  const [byTitle, matchingAuthors] = await Promise.all([
    supabase
      .from("books")
      .select(BOOK_SEARCH_COLUMNS)
      .eq("published", true)
      .ilike("title", likeQ)
      .order("view_count", { ascending: false })
      .limit(SEARCH_LIMIT),
    supabase.from("author_public_profiles").select("id, nickname").ilike("nickname", likeQ),
  ]);

  const authorIds = (matchingAuthors.data ?? []).map((a) => a.id);
  const byAuthor = authorIds.length
    ? await supabase
        .from("books")
        .select(BOOK_SEARCH_COLUMNS)
        .eq("published", true)
        .in("author_id", authorIds)
        .limit(SEARCH_LIMIT)
    : { data: [] as BookSearchRow[] };

  const merged = new Map<string, BookSearchRow>();
  for (const row of [...(byTitle.data ?? []), ...(byAuthor.data ?? [])]) merged.set(row.id, row);
  const rows = [...merged.values()].slice(0, SEARCH_LIMIT);
  if (rows.length === 0) return [];

  const nicknameIds = [...new Set(rows.map((r) => r.author_id))];
  const [{ data: authors }, coverUrls] = await Promise.all([
    supabase.from("author_public_profiles").select("id, nickname").in("id", nicknameIds),
    Promise.all(rows.map((r) => resolveBookCoverUrl(supabase, r))),
  ]);
  const nicknameById = new Map((authors ?? []).map((a) => [a.id, a.nickname]));

  return rows.map((r, i) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    genre: r.genre,
    authorNickname: nicknameById.get(r.author_id) ?? null,
    coverUrl: coverUrls[i],
  }));
}
