import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { applyPublicAssetWatermark } from "@/lib/copyright/public-asset-watermark";
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

  // Ép PNG + nhúng XMP "không cho AI huấn luyện" (ẩn, không che ảnh) —
  // xem src/lib/copyright/public-asset-watermark.ts. Luôn ra .png bất kể
  // định dạng gốc (jpg/webp) vì sharp không ghi XMP tuỳ ý được cho 2 định
  // dạng đó. `void ext` — biến ALLOWED_MIME_EXT vẫn dùng để validate MIME
  // gốc phía trên, chỉ không còn quyết định phần mở rộng file nữa.
  const rightsHolderLabel = await (async () => {
    const { data: profile } = await supabase.from("profiles").select("nickname").eq("id", user.id).single();
    return profile?.nickname || "Hoạ sĩ trên Vịnh";
  })();
  const originalBuffer = Buffer.from(await file.arrayBuffer());
  let watermarked: Buffer;
  try {
    watermarked = await applyPublicAssetWatermark(originalBuffer, rightsHolderLabel);
  } catch (err) {
    console.error("[api/design] watermark failed:", err);
    return NextResponse.json({ error: "Xử lý ảnh thất bại." }, { status: 500 });
  }

  const path = `${user.id}/gallery-${Date.now()}.png`;
  const { error: uploadError } = await supabase.storage
    .from("design-images")
    .upload(path, watermarked, { contentType: "image/png" });
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

  // Ghi nhận đã bảo hộ — bảng content_protection_status chỉ admin đọc
  // được qua RLS (xem migrations/20260907_add_content_protection_status.sql),
  // nên phải dùng service-role ở đây, không phải `supabase` (client theo
  // cookie của hoạ sĩ) đang dùng cho phần còn lại của route. Lỗi ở bước
  // này không nên chặn phản hồi thành công cho hoạ sĩ — ảnh đã lên thật
  // và đã bảo hộ, chỉ là admin dashboard sẽ đếm thiếu 1 dòng.
  const { error: protectionError } = await createServiceRoleClient()
    .from("content_protection_status")
    .insert({ content_type: "design", content_id: item.id, method: "xmp_png" });
  if (protectionError) {
    console.error("[api/design] content_protection_status insert failed:", protectionError);
  }

  return NextResponse.json({ ok: true, id: item.id });
}
