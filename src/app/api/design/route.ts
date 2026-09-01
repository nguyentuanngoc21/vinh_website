import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { DesignItemCategory } from "@/lib/supabase/types";

const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const CATEGORIES: DesignItemCategory[] = ["bia_truyen", "minh_hoa", "fan_art", "poster_audio"];

/**
 * POST /api/design — họa sĩ tự đăng 1 tác phẩm ĐỘC LẬP lên kho Thiết kế
 * (/thiet-ke/new), khác luồng "bìa truyện" tự động ở
 * /api/authoring/books/[bookId]/cover (source='story_upload', không có
 * category). Dùng client cookie-bound của chính họ (không phải
 * service-role) — RLS "illustrators insert their own design items" đã đủ,
 * và bucket 'design-images' yêu cầu path bắt đầu bằng đúng auth.uid() của
 * người upload (xem docs/supabase/schema.sql phần 9, storage policies).
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
  const category = String(form.get("category") ?? "");
  const file = form.get("image");

  if (!title) {
    return NextResponse.json({ error: "Thiếu tiêu đề tác phẩm." }, { status: 400 });
  }
  if (!CATEGORIES.includes(category as DesignItemCategory)) {
    return NextResponse.json({ error: "Vui lòng chọn thể loại hợp lệ." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Thiếu ảnh tác phẩm." }, { status: 400 });
  }
  const ext = ALLOWED_MIME_EXT[file.type];
  if (!ext) {
    return NextResponse.json({ error: "Chỉ nhận ảnh định dạng JPG, PNG hoặc WEBP." }, { status: 400 });
  }
  if (file.size > IMAGE_MAX_BYTES) {
    return NextResponse.json({ error: "Ảnh tối đa 8MB." }, { status: 400 });
  }

  const path = `${user.id}/gallery-${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("design-images")
    .upload(path, file, { contentType: file.type });
  if (uploadError) {
    console.error("[api/design] upload failed:", uploadError);
    return NextResponse.json({ error: `Tải ảnh thất bại: ${uploadError.message}` }, { status: 500 });
  }

  const { data: item, error: insertError } = await supabase
    .from("design_items")
    .insert({
      illustrator_id: user.id,
      title,
      description: description || null,
      category: category as DesignItemCategory,
      image_url: path,
      source: "independent",
    })
    .select("id")
    .single();
  if (insertError || !item) {
    console.error("[api/design] insert failed:", insertError);
    return NextResponse.json({ error: "Đăng tác phẩm thất bại." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: item.id });
}
