import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { HOMEPAGE_BOOK_COLUMNS, toHomepageBooks, type HomepageBook } from "@/lib/home/get-homepage-books";

const RECOMMENDATION_LIMIT = 10;

/**
 * Gợi ý cá nhân hoá — wraps recommend_books() (docs/supabase/schema.sql),
 * hàm SQL đã tồn tại từ trước (cosine similarity trên books.embedding,
 * trung bình 20 lượt đọc gần nhất; không có lịch sử đọc thì fallback sách
 * mới publish) nhưng CHƯA từng được gọi ở đâu trong app cho tới bây giờ.
 * Không hardcode lại logic join tác giả/bìa — tái dùng đúng
 * toHomepageBooks() (đã áp dụng cho NewWorksGrid/BookCoverflow) vì
 * recommend_books() trả về nguyên hàng `books`, cùng shape với các query
 * trong get-homepage-books.ts.
 */
export async function getRecommendedBooks(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<HomepageBook[]> {
  // .select() sau rpc(): PostgREST chỉ trả các cột cần, bỏ `embedding`
  // mà hàm (returns setof books) vẫn trả về nguyên hàng.
  const { data, error } = await supabase
    .rpc("recommend_books", {
      p_user_id: userId,
      p_limit: RECOMMENDATION_LIMIT,
    })
    .select(HOMEPAGE_BOOK_COLUMNS);
  if (error || !data) return [];
  return toHomepageBooks(supabase, data);
}
