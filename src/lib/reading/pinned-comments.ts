import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type PinnedChapterComment = {
  authorName: string;
  content: string;
};

/**
 * Bình luận chương được tác giả ghim (tối đa 1/chương — xem
 * migrations/20261006_chapter_pinned_comment.sql) của nhiều chương cùng lúc,
 * cho danh sách chương ở /truyen/[slug] (hiện khi hover). Lỗi → map rỗng:
 * đây chỉ là phần phụ, không làm hỏng trang truyện.
 */
export async function loadPinnedChapterComments(
  supabase: SupabaseClient<Database>,
  chapterIds: string[]
): Promise<Map<string, PinnedChapterComment>> {
  const result = new Map<string, PinnedChapterComment>();
  if (!chapterIds.length) return result;

  const { data: rows, error } = await supabase
    .from("anchored_comments")
    .select("chapter_id, user_id, content")
    .in("chapter_id", chapterIds)
    .not("pinned_at", "is", null);
  if (error) {
    console.error("[pinned-comments] load failed:", error);
    return result;
  }
  if (!rows?.length) return result;

  const { data: profiles } = await supabase
    .from("author_public_profiles")
    .select("id, nickname")
    .in("id", [...new Set(rows.map((r) => r.user_id))]);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.nickname]));

  for (const r of rows) {
    result.set(r.chapter_id, { authorName: nameById.get(r.user_id) ?? "Người dùng ẩn danh", content: r.content });
  }
  return result;
}
