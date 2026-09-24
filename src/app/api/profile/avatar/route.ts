import { NextResponse } from "next/server";
import { getRequestContext, requestError } from "@/lib/mobile/request-context";

// Kích thước tối đa (15MB) không còn kiểm ở route này — file giờ đi thẳng
// từ trình duyệt lên Storage qua signed upload URL, route chỉ cấp URL.
// Chốt chặn thật sự là storage.buckets.file_size_limit trên bucket
// "avatars" (xem migrations/20260914_raise_avatar_cover_size_limit.sql);
// phía client (profile-header.tsx) cũng tự chặn sớm cho UX.
const ALLOWED_MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Ảnh đại diện trang cá nhân/tác giả — cùng bucket "avatars" đã có (public,
 * RLS folder-per-user), khác filename prefix ("avatar-" thay vì "cover-").
 * Không cần bucket/migration storage riêng. Mirror api/profile/cover/route.ts.
 *
 * Upload đi qua signed upload URL (POST tạo URL -> client PUT thẳng lên
 * Storage -> PATCH xác nhận), KHÔNG còn multipart qua route này — Vercel
 * Serverless Functions giới hạn cứng body request ở ~4.5MB (giới hạn
 * platform, không sửa được bằng code), nên trước đây avatar/cover không
 * thể lớn hơn ~4.5MB dù route có tự khai "tối đa 5MB". Đi thẳng lên Storage
 * bỏ qua giới hạn đó hoàn toàn.
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
    .select("avatar_url")
    .eq("id", userId)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Không tìm thấy hồ sơ." }, { status: 404 });
  }

  return NextResponse.json({ avatarUrl: data.avatar_url });
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

  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const { data, error } = await supabase.storage.from("avatars").createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[profile/avatar] createSignedUploadUrl failed:", error);
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
  // Chặn xác nhận path không thuộc thư mục của chính user này (mỗi user 1
  // folder theo userId, khớp policy "users upload and replace their own
  // avatar" trong docs/supabase/schema.sql).
  if (!path || !path.startsWith(`${userId}/avatar-`)) {
    return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
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

export async function DELETE(request: Request) {
  let auth;
  try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
  const { client: supabase, userId } = auth;
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
