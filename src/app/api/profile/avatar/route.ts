import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Ảnh đại diện trang cá nhân/tác giả — cùng bucket "avatars" đã có (public,
 * RLS folder-per-user), khác filename prefix ("avatar-" thay vì "cover-").
 * Không cần bucket/migration storage riêng. Mirror api/profile/cover/route.ts.
 */
export async function GET() {
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", userId)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Không tìm thấy hồ sơ." }, { status: 404 });
  }

  return NextResponse.json({ avatarUrl: data.avatar_url });
}

export async function POST(request: Request) {
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
  }

  const file = form.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Thiếu ảnh đại diện." }, { status: 400 });
  }

  const ext = ALLOWED_MIME_EXT[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "Chỉ nhận ảnh định dạng JPG, PNG hoặc WEBP." },
      { status: 400 }
    );
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return NextResponse.json({ error: "Ảnh đại diện tối đa 5MB." }, { status: 400 });
  }

  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { contentType: file.type });
  if (uploadError) {
    console.error("[profile/avatar] upload failed:", uploadError);
    return NextResponse.json({ error: `Tải ảnh đại diện thất bại: ${uploadError.message}` }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
  const avatarUrl = urlData.publicUrl;

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl })
    .eq("id", userId);
  if (profileError) {
    console.error("[profile/avatar] update profiles failed:", profileError);
    return NextResponse.json({ error: `Cập nhật hồ sơ thất bại: ${profileError.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, avatarUrl });
}

export async function DELETE() {
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Chỉ gỡ tham chiếu — không xoá file khỏi bucket "avatars" (mirrors
  // cover_image_url: không có luồng dọn storage tương ứng nào trong repo
  // hiện tại, không thêm complexity đó ở đây).
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: null })
    .eq("id", userId);
  if (error) {
    console.error("[profile/avatar] clear failed:", error);
    return NextResponse.json({ error: "Gỡ ảnh đại diện thất bại." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, avatarUrl: null });
}
