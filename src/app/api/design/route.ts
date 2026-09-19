import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DESIGN_CATEGORIES } from "@/lib/design/get-design-gallery";
import { ART_STYLES } from "@/lib/design/art-styles";
import { resolveOrCreateAlbum, uploadDesignImage } from "@/lib/design/design-items-service";
import type { ArtStyle, DesignItemCategory } from "@/lib/supabase/types";

const CATEGORY_KEYS = DESIGN_CATEGORIES.map((c) => c.key);
const ART_STYLE_KEYS = ART_STYLES.map((s) => s.key);

/**
 * POST /api/design — họa sĩ tự đăng 1 tác phẩm ĐỘC LẬP lên kho Thiết kế
 * (/thiet-ke/new), khác luồng "bìa truyện" tự động ở
 * /api/authoring/books/[bookId]/cover (source='story_upload', không có
 * category). Dùng client cookie-bound của chính họ (không phải
 * service-role) — RLS "illustrators insert their own design items" đã đủ,
 * và bucket 'design-images' yêu cầu path bắt đầu bằng đúng auth.uid() của
 * người upload (xem docs/supabase/schema.sql phần 9, storage policies).
 *
 * 1 ảnh / lần gọi — form Pinterest-style ở design-upload-form.tsx gọi
 * route này ngay khi từng ảnh được chọn (multi-select), không đợi 1 nút
 * "Đăng" tổng, để mỗi ảnh có id thật sớm (cần cho nút "Tạo link liên kết").
 * albumId HOẶC albumName+artStyle — tạo/đính vào album qua
 * resolveOrCreateAlbum() (src/lib/design/design-items-service.ts).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return NextResponse.json({ error: "Vui lòng đăng nhập để đăng thiết kế." }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
  }

  const title = String(form.get("title") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const altText = String(form.get("altText") ?? "").trim();
  const category = String(form.get("category") ?? "");
  const albumId = form.get("albumId") ? String(form.get("albumId")) : null;
  const albumName = form.get("albumName") ? String(form.get("albumName")).trim() : null;
  const artStyle = form.get("artStyle") ? String(form.get("artStyle")) : null;
  const file = form.get("image");

  if (!title) {
    return NextResponse.json({ error: "Thiếu tiêu đề tác phẩm." }, { status: 400 });
  }
  if (!CATEGORY_KEYS.includes(category as DesignItemCategory)) {
    return NextResponse.json({ error: "Vui lòng chọn loại sản phẩm hợp lệ." }, { status: 400 });
  }
  if (artStyle && !ART_STYLE_KEYS.includes(artStyle as ArtStyle)) {
    return NextResponse.json({ error: "Phong cách nghệ thuật không hợp lệ." }, { status: 400 });
  }

  const albumResult = await resolveOrCreateAlbum({
    supabase,
    userId: user.id,
    albumId,
    albumName: albumId ? null : albumName,
    artStyle: artStyle as ArtStyle | null,
  });
  if (!albumResult.ok) {
    return NextResponse.json({ error: albumResult.error }, { status: albumResult.status });
  }

  const result = await uploadDesignImage({
    supabase,
    userId: user.id,
    file,
    title,
    category: category as DesignItemCategory,
    description: description || null,
    altText: altText || null,
    albumId: albumResult.albumId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, id: result.id, imageUrl: result.imageUrl });
}
