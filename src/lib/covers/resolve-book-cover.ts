import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type ResolvableBook = {
  cover_design_item_id: string | null;
};

/**
 * Trả về URL ảnh bìa THẬT nếu sách đã gắn design item (qua
 * link_cover_to_book(), xem docs/supabase/schema.sql), hoặc null nếu
 * chưa — lúc đó gọi buildCoverSpec() (build-cover-spec.ts) để sinh bìa
 * placeholder thay thế (src/components/covers/book-cover.tsx).
 *
 * Query qua view `public_design_items`, KHÔNG phải bảng gốc
 * `design_items`: bảng gốc chỉ cho illustrator sở hữu SELECT (RLS) —
 * query trực tiếp bảng gốc sẽ silently trả rỗng cho bìa do 1 họa sĩ KHÁC
 * thực hiện hộ tác giả, đúng ngay use-case "commission bìa" nền tảng
 * hướng tới. Đây là nơi DUY NHẤT trong repo gọi getPublicUrl() — bucket
 * `design-images` là public (đã xác nhận trong schema.sql), nên đây chỉ
 * là dựng URL cục bộ, không có network call.
 */
export async function resolveBookCoverUrl(
  supabase: SupabaseClient<Database>,
  book: ResolvableBook
): Promise<string | null> {
  if (!book.cover_design_item_id) return null;

  const { data, error } = await supabase
    .from("public_design_items")
    .select("image_url")
    .eq("id", book.cover_design_item_id)
    .maybeSingle();

  if (error) {
    console.error("[covers] resolveBookCoverUrl: query public_design_items failed:", error);
    return null;
  }
  if (!data) return null;

  const { data: urlData } = supabase.storage.from("design-images").getPublicUrl(data.image_url);
  return urlData.publicUrl;
}

/**
 * Bản batch của resolveBookCoverUrl() cho trang danh sách (home, xếp
 * hạng, tìm kiếm, /ket-noi, workspace tác giả...): 1 query `.in()` cho cả
 * danh sách thay vì 1 query/sách. Trả về mảng URL cùng thứ tự với `books`
 * (null = chưa gắn bìa thật, hoặc query lỗi — cùng ngữ nghĩa bản đơn).
 */
export async function resolveBookCoverUrls(
  supabase: SupabaseClient<Database>,
  books: readonly ResolvableBook[]
): Promise<(string | null)[]> {
  const ids = [...new Set(books.map((b) => b.cover_design_item_id).filter((id): id is string => !!id))];
  if (ids.length === 0) return books.map(() => null);

  const { data, error } = await supabase.from("public_design_items").select("id, image_url").in("id", ids);
  if (error) {
    console.error("[covers] resolveBookCoverUrls: query public_design_items failed:", error);
    return books.map(() => null);
  }

  const bucket = supabase.storage.from("design-images");
  const urlById = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.id && row.image_url) urlById.set(row.id, bucket.getPublicUrl(row.image_url).data.publicUrl);
  }
  return books.map((b) => (b.cover_design_item_id ? urlById.get(b.cover_design_item_id) ?? null : null));
}
