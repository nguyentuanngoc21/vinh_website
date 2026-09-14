import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookGenre, Database } from "@/lib/supabase/types";
import { resolveBookCoverUrl } from "@/lib/covers/resolve-book-cover";
import type { BookSearchResult } from "./search-books";

const PAGE_SIZE = 24;
const BOOK_COLUMNS = "id, slug, title, genre, author_id, cover_design_item_id, view_count, created_at";

type BookRow = {
  id: string;
  slug: string;
  title: string;
  genre: BookGenre | null;
  author_id: string;
  cover_design_item_id: string | null;
  view_count: number;
  created_at: string;
};

export type GenreBooksPage = {
  books: BookSearchResult[];
  /** true nếu còn trang sau — dùng cho nút "Xem thêm" nếu cần sau này;
   * trang đầu (page.tsx) hiện chỉ hiển thị 1 trang, không phân trang UI. */
  hasMore: boolean;
};

/**
 * Sách theo 1 thể loại cụ thể, dùng cho /truyen (xem
 * src/app/truyen/page.tsx) — KHÔNG sửa searchBooks() trong search-books.ts
 * (trang tìm kiếm giữ nguyên hành vi free-text hiện có); đây là truy vấn
 * riêng. `genre = null` bỏ hẳn điều kiện lọc thể loại — dùng cho fallback
 * khi /truyen không có ?the-loai= hợp lệ (xem truyen/page.tsx), tái dùng 1
 * hàm thay vì viết thêm 1 truy vấn "tất cả sách" riêng. Cùng cột/cùng cách
 * resolve cover với searchBooks() để card hiển thị nhất quán giữa 2 trang.
 */
export async function getBooksByGenre(
  supabase: SupabaseClient<Database>,
  genre: BookGenre | null,
  page = 0
): Promise<GenreBooksPage> {
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE; // +1 để biết còn trang sau không, cắt lại dưới

  let query = supabase
    .from("books")
    .select(BOOK_COLUMNS)
    .eq("published", true)
    .order("view_count", { ascending: false })
    .range(from, to);
  if (genre) query = query.eq("genre", genre);

  const { data, error } = await query;

  if (error || !data) return { books: [], hasMore: false };

  const hasMore = data.length > PAGE_SIZE;
  const rows = (data as BookRow[]).slice(0, PAGE_SIZE);
  if (rows.length === 0) return { books: [], hasMore: false };

  const authorIds = [...new Set(rows.map((r) => r.author_id))];
  const [{ data: authors }, coverUrls] = await Promise.all([
    supabase.from("author_public_profiles").select("id, nickname").in("id", authorIds),
    Promise.all(rows.map((r) => resolveBookCoverUrl(supabase, r))),
  ]);
  const nicknameById = new Map((authors ?? []).map((a) => [a.id, a.nickname]));

  return {
    hasMore,
    books: rows.map((r, i) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      genre: r.genre,
      authorNickname: nicknameById.get(r.author_id) ?? null,
      coverUrl: coverUrls[i],
    })),
  };
}
