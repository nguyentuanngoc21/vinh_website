import { NextResponse } from "next/server";
import { getRequestContext, requestError } from "@/lib/mobile/request-context";

// Xem giải thích đầy đủ trong api/profile/avatar/route.ts — cùng lý do,
// cùng cơ chế signed upload URL, cùng chốt chặn 15MB ở bucket "avatars".
const ALLOWED_MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Ảnh bìa trang cá nhân/tác giả — cùng bucket "avatars" đã có (public,
 * RLS folder-per-user), khác filename prefix ("cover-" thay vì
 * "avatar-"). Không cần bucket/migration storage riêng — xem
 * migrations/20260828_add_profile_cover_image.sql.
 *
 * Upload đi qua signed upload URL (POST tạo URL -> client PUT thẳng lên
 * Storage -> PATCH xác nhận), KHÔNG còn multipart qua route này — mirror
 * api/profile/avatar/route.ts (đọc comment ở đó để biết lý do bỏ qua
 * giới hạn body ~4.5MB của Vercel Serverless Functions).
 */
export async function GET(request: Request) {
  let auth;
  try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
  const { client: supabase, userId } = auth;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("cover_image_url")
    .eq("id", userId)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Không tìm thấy hồ sơ." }, { status: 404 });
  }

  return NextResponse.json({ coverImageUrl: data.cover_image_url });
}

/** Bước 1: sinh signed upload URL cho client PUT thẳng file lên Storage. */
export async function POST(request: Request) {
  let auth;
  try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
  const { client: supabase, userId } = auth;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const contentType = typeof body?.contentType === "string" ? body.contentType : null;
  const ext = contentType ? ALLOWED_MIME_EXT[contentType] : null;
  if (!ext) {
    return NextResponse.json(
      { error: "Chỉ nhận ảnh định dạng JPG, PNG hoặc WEBP." },
      { status: 400 }
    );
  }

  const path = `${userId}/cover-${Date.now()}.${ext}`;
  const { data, error } = await supabase.storage.from("avatars").createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[profile/cover] createSignedUploadUrl failed:", error);
    return NextResponse.json({ error: "Không tạo được link tải ảnh." }, { status: 500 });
  }

  return NextResponse.json({ path: data.path, token: data.token, signedUrl: data.signedUrl });
}

/** Bước 2: client đã upload xong lên `path` — xác nhận và lưu vào hồ sơ. */
export async function PATCH(request: Request) {
  let auth;
  try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
  const { client: supabase, userId } = auth;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const path = typeof body?.path === "string" ? body.path : null;
  if (!path || !path.startsWith(`${userId}/cover-`)) {
    return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
  }

  const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
  const coverImageUrl = urlData.publicUrl;

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ cover_image_url: coverImageUrl })
    .eq("id", userId);
  if (profileError) {
    console.error("[profile/cover] update profiles failed:", profileError);
    return NextResponse.json({ error: `Cập nhật hồ sơ thất bại: ${profileError.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, coverImageUrl });
}

export async function DELETE(request: Request) {
  let auth;
  try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
  const { client: supabase, userId } = auth;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Chỉ gỡ tham chiếu — không xoá file khỏi bucket "avatars" (mirrors
  // avatar_url: không có luồng dọn storage tương ứng nào trong repo hiện
  // tại, không thêm complexity đó ở đây).
  const { error } = await supabase
    .from("profiles")
    .update({ cover_image_url: null })
    .eq("id", userId);
  if (error) {
    console.error("[profile/cover] clear failed:", error);
    return NextResponse.json({ error: "Gỡ ảnh bìa thất bại." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, coverImageUrl: null });
}
