import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { applyPublicAssetWatermark } from "@/lib/copyright/public-asset-watermark";
import { RewardEngine } from "@/lib/quests/reward-engine";
import type { ArtStyle, Database, DesignItemCategory } from "@/lib/supabase/types";

const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Logic dùng chung giữa POST /api/design (đăng độc lập, có thể gọi nhiều
 * lần liên tiếp — mỗi ảnh trong form Pinterest-style tự lưu ngay khi chọn)
 * và trước đây từng nằm thẳng trong route đó (xem lịch sử
 * src/app/api/design/route.ts). Tách ra để cả route đăng và (nếu cần sau
 * này) 1 route khác dùng lại được, KHÔNG phải để dự phòng cho use-case
 * chưa có.
 */

export type UploadDesignImageInput = {
  supabase: SupabaseClient<Database>;
  userId: string;
  // unknown, không phải File — form.get("image") trả FormDataEntryValue |
  // null, validateDesignImageFile() tự kiểm instanceof File bên trong.
  file: unknown;
  title: string;
  category: DesignItemCategory;
  description: string | null;
  altText: string | null;
  albumId: string | null;
};

export type UploadDesignImageResult =
  | { ok: true; id: string; imageUrl: string }
  | { ok: false; error: string; status: number };

export async function validateDesignImageFile(file: unknown): Promise<
  { ok: true; file: File; ext: string } | { ok: false; error: string; status: number }
> {
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Thiếu ảnh tác phẩm.", status: 400 };
  }
  const ext = ALLOWED_MIME_EXT[file.type];
  if (!ext) {
    return { ok: false, error: "Chỉ nhận ảnh định dạng JPG, PNG hoặc WEBP.", status: 400 };
  }
  if (file.size > IMAGE_MAX_BYTES) {
    return { ok: false, error: "Ảnh tối đa 8MB.", status: 400 };
  }
  return { ok: true, file, ext };
}

/**
 * Watermark + upload + insert 1 dòng design_items. Dùng client
 * cookie-bound của chính hoạ sĩ (RLS "illustrators insert their own design
 * items" đã đủ) — KHÔNG service-role, giống route gốc.
 *
 * Path bucket thêm hậu tố random (khác bản gốc chỉ dùng Date.now()) —
 * upload nhiều ảnh liên tiếp trong 1 lần chọn file (multi-select) có thể
 * rơi vào cùng 1 millisecond, Date.now() không còn đủ duy nhất một khi
 * multi-upload trở thành luồng chính.
 */
export async function uploadDesignImage(input: UploadDesignImageInput): Promise<UploadDesignImageResult> {
  const { supabase, userId, file: rawFile, title, category, description, altText, albumId } = input;

  const validated = await validateDesignImageFile(rawFile);
  if (!validated.ok) return { ok: false, error: validated.error, status: validated.status };
  const file = validated.file;

  const { data: profile } = await supabase.from("profiles").select("nickname").eq("id", userId).single();
  const rightsHolderLabel = profile?.nickname || "Hoạ sĩ trên Vịnh";

  const originalBuffer = Buffer.from(await file.arrayBuffer());
  let watermarked: Buffer;
  try {
    watermarked = await applyPublicAssetWatermark(originalBuffer, rightsHolderLabel);
  } catch (err) {
    console.error("[design-items-service] watermark failed:", err);
    return { ok: false, error: "Xử lý ảnh thất bại.", status: 500 };
  }

  const path = `${userId}/gallery-${Date.now()}-${randomUUID().slice(0, 8)}.png`;
  const { error: uploadError } = await supabase.storage
    .from("design-images")
    .upload(path, watermarked, { contentType: "image/png" });
  if (uploadError) {
    console.error("[design-items-service] upload failed:", uploadError);
    return { ok: false, error: `Tải ảnh thất bại: ${uploadError.message}`, status: 500 };
  }

  const { data: item, error: insertError } = await supabase
    .from("design_items")
    .insert({
      illustrator_id: userId,
      title,
      description,
      category,
      alt_text: altText,
      album_id: albumId,
      image_url: path,
      source: "independent",
    })
    .select("id")
    .single();
  if (insertError || !item) {
    console.error("[design-items-service] insert failed:", insertError);
    return { ok: false, error: "Đăng tác phẩm thất bại.", status: 500 };
  }

  // Cả 2 bước dưới đây không nên chặn phản hồi thành công — ảnh đã lên
  // thật, chỉ là admin dashboard/quest có thể đếm thiếu 1 dòng nếu lỗi.
  const serviceClient = createServiceRoleClient();
  const { error: protectionError } = await serviceClient
    .from("content_protection_status")
    .insert({ content_type: "design", content_id: item.id, method: "xmp_png" });
  if (protectionError) {
    console.error("[design-items-service] content_protection_status insert failed:", protectionError);
  }
  const questResult = await RewardEngine.incrementTaskProgress(serviceClient, {
    userId,
    taskCode: "designer_upload_design",
  });
  if (!questResult.ok) {
    console.error("[design-items-service] incrementTaskProgress failed:", questResult.error);
  }

  const { data: urlData } = supabase.storage.from("design-images").getPublicUrl(path);
  return { ok: true, id: item.id, imageUrl: urlData.publicUrl };
}

export type ResolveAlbumResult =
  | { ok: true; albumId: string | null }
  | { ok: false; error: string; status: number };

/**
 * "Tên album" trong form đăng — resolve-or-create, KHÔNG tự đổi art_style
 * của 1 album đã tồn tại (đổi style của album có sẵn phải đi qua PATCH
 * /api/design/albums/[albumId] riêng, tránh 1 lần đăng ảnh vô tình đổi
 * style cho những ảnh khác đã có trong album đó từ trước).
 */
export async function resolveOrCreateAlbum(params: {
  supabase: SupabaseClient<Database>;
  userId: string;
  albumId: string | null;
  albumName: string | null;
  artStyle: ArtStyle | null;
}): Promise<ResolveAlbumResult> {
  const { supabase, userId, albumId, albumName, artStyle } = params;

  if (albumId) {
    const { data: existing } = await supabase
      .from("design_albums")
      .select("id")
      .eq("id", albumId)
      .eq("illustrator_id", userId)
      .maybeSingle();
    if (!existing) {
      return { ok: false, error: "Không tìm thấy album.", status: 404 };
    }
    return { ok: true, albumId: existing.id };
  }

  if (!albumName) {
    return { ok: true, albumId: null };
  }

  const { data: byName } = await supabase
    .from("design_albums")
    .select("id")
    .eq("illustrator_id", userId)
    .eq("name", albumName)
    .maybeSingle();
  if (byName) {
    return { ok: true, albumId: byName.id };
  }

  if (!artStyle) {
    return { ok: false, error: "Vui lòng chọn phong cách nghệ thuật cho album mới.", status: 400 };
  }
  const { data: created, error: createError } = await supabase
    .from("design_albums")
    .insert({ illustrator_id: userId, name: albumName, art_style: artStyle })
    .select("id")
    .single();
  if (createError || !created) {
    console.error("[design-items-service] album insert failed:", createError);
    return { ok: false, error: "Tạo album thất bại.", status: 500 };
  }
  return { ok: true, albumId: created.id };
}
