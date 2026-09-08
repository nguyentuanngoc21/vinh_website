import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreatorRole, Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

/**
 * Role nào của user này đã "unlock" — tính bằng EXISTS trên sản phẩm THẬT
 * đã đăng (books/audio_narrations/design_items), KHÔNG dùng
 * profiles.creator_tags (tự khai, chưa có UI để user tự set, và không
 * mang quyền hạn theo thiết kế gốc — xem docs/supabase/schema.sql phần 1).
 * connect-directory.tsx đã gặp đúng vấn đề này rồi ("creator_tags... nên
 * gần như luôn rỗng dù người đó đã có tác phẩm thật") và bỏ dùng
 * creator_tags để suy role hiển thị — hàm này áp dụng cùng cách suy cho
 * mục đích gate quest.
 *
 * VĨNH VIỄN by construction, không cần cache trên profiles: hệ thống
 * không xoá hàng thật (soft-delete/purge chỉ rỗng nội dung, giữ nguyên
 * author_id/narrator_id/illustrator_id — xem
 * migrations/20260908_add_content_purge_retention.sql), nên một khi
 * EXISTS true, nó mãi mãi true kể cả sau khi xoá/purge hết nội dung của
 * role đó.
 *
 * Sách: chỉ tính `published = true` (books có trạng thái draft, chưa
 * publish thì chưa coi là "đã đăng"). Audio/design: không có cột
 * published (tạo là public luôn — xem docs/supabase/schema.sql phần 9),
 * nên có hàng là tính.
 *
 * 3 query độc lập (3 bảng khác nhau, khác cột khoá ngoại, không JOIN
 * được), mỗi query chỉ đếm sự tồn tại (head: true, không cần count thật) —
 * rẻ, đi qua đúng khoá ngoại author_id/narrator_id/illustrator_id.
 */
export async function getUnlockedRoles(supabase: Client, userId: string): Promise<Set<CreatorRole>> {
  const [authorRes, narratorRes, designerRes] = await Promise.all([
    supabase.from("books").select("id", { count: "exact", head: true }).eq("author_id", userId).eq("published", true),
    supabase.from("audio_narrations").select("id", { count: "exact", head: true }).eq("narrator_id", userId),
    supabase.from("design_items").select("id", { count: "exact", head: true }).eq("illustrator_id", userId),
  ]);

  const roles = new Set<CreatorRole>();
  if ((authorRes.count ?? 0) > 0) roles.add("author");
  if ((narratorRes.count ?? 0) > 0) roles.add("narrator");
  if ((designerRes.count ?? 0) > 0) roles.add("designer");
  return roles;
}

/** true nếu template này áp dụng cho user có `unlockedRoles` — for_role
 * NULL nghĩa là áp dụng chung (mặc định đọc giả), không cần role nào. */
export function isTemplateUnlockedForRoles(
  forRole: CreatorRole | null,
  unlockedRoles: Set<CreatorRole>
): boolean {
  return forRole === null || unlockedRoles.has(forRole);
}
