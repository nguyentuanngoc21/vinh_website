import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DESIGN_CATEGORIES } from "@/lib/design/get-design-gallery";
import type { DesignItemCategory } from "@/lib/supabase/types";

const CATEGORY_LABEL: Record<DesignItemCategory, string> = Object.fromEntries(
  DESIGN_CATEGORIES.map((c) => [c.key, c.label])
) as Record<DesignItemCategory, string>;

/**
 * GET /api/design/mine — TOÀN BỘ ảnh của chính người gọi (draft lẫn đã
 * công khai, deleted_at is null), cho trang quản lý /thiet-ke/quan-ly.
 * Khác form đăng (/thiet-ke/new, design-upload-form.tsx) chỉ giữ danh
 * sách trong state của phiên hiện tại — route này đọc lại từ server nên
 * vẫn thấy được ảnh đã đăng ở những lượt TRƯỚC, cần để xoá ảnh lỡ đăng
 * sai sau khi đã rời trang đăng. Dùng client cookie-bound + RLS
 * "illustrators view their own design items" (đã bao gồm draft, vì đó là
 * policy trên bảng gốc, không phải view public_design_items).
 */
export async function GET() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
  }

  const { data: rows, error } = await supabase
    .from("design_items")
    .select("id, title, description, alt_text, image_url, category, published_at, created_at, album_id, share_token")
    // Chỉ ảnh đăng ĐỘC LẬP qua /thiet-ke/new — bìa truyện tự động (source
    // 'story_upload', xem authoring/books/[bookId]/cover/route.ts) không
    // có category, không có nút "Hoàn tất" nào công khai được, hiện ở đây
    // sẽ mãi mãi là "Chưa công khai" dù không hề sai — gây hiểu lầm, nên
    // loại khỏi trang quản lý này ngay từ query.
    .eq("source", "independent")
    .eq("illustrator_id", userData.user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[api/design/mine] query failed:", error);
    return NextResponse.json({ error: "Không tải được danh sách ảnh." }, { status: 500 });
  }

  const items = rows ?? [];
  const albumIds = [...new Set(items.map((i) => i.album_id).filter((id): id is string => id != null))];
  const { data: albums } = albumIds.length > 0
    ? await supabase.from("design_albums").select("id, name").in("id", albumIds)
    : { data: [] };
  const albumById = new Map((albums ?? []).map((a) => [a.id, a.name]));

  return NextResponse.json({
    items: items.map((item) => {
      const { data: urlData } = supabase.storage.from("design-images").getPublicUrl(item.image_url);
      const category = item.category as DesignItemCategory | null;
      return {
        id: item.id,
        title: item.title,
        description: item.description,
        altText: item.alt_text,
        imageUrl: urlData.publicUrl,
        category,
        categoryLabel: category ? CATEGORY_LABEL[category] ?? "Khác" : "Khác",
        published: item.published_at != null,
        createdAt: item.created_at,
        albumId: item.album_id,
        albumName: item.album_id ? albumById.get(item.album_id) ?? null : null,
        // Chỉ owner đọc được cột này (RLS) — route này vốn đã owner-scoped
        // (eq illustrator_id chính người gọi), khác public_design_items
        // (view public, CỐ Ý không có cột này).
        shareToken: item.share_token,
      };
    }),
  });
}
