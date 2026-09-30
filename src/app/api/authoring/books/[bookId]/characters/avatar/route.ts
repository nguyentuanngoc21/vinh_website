import { NextResponse } from "next/server";
import { getUserContext, requestError } from "@/lib/mobile/request-context";
import { isUuid } from "@/lib/validation/uuid";

const ALLOWED_MIME_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/**
 * Signed upload URL for a character avatar in the public "avatars" bucket,
 * under the author's own folder — same direct-to-Storage flow as
 * api/profile/avatar/route.ts (bypasses the ~4.5MB function body limit).
 * Returns the public URL; it is saved via the normal character POST/PATCH
 * (avatar_url), so no separate confirm step.
 */
export async function POST(request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const body = await request.json().catch(() => null);
  const ext = typeof body?.contentType === "string" ? ALLOWED_MIME_EXT[body.contentType] : undefined;
  if (!isUuid(bookId)) return NextResponse.json({ error: "Truyện không hợp lệ." }, { status: 400 });
  if (!ext) return NextResponse.json({ error: "Chỉ nhận ảnh định dạng JPG, PNG hoặc WEBP." }, { status: 400 });
  let auth;
  try { auth = await getUserContext(request); } catch (e) { return requestError(e); }
  if (!auth.userId) return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
  // RLS on books limits this to the caller's own (non-deleted) books.
  const { data: book, error: bookError } = await auth.supabase.from("books").select("id")
    .eq("id", bookId).eq("author_id", auth.userId).is("deleted_at", null).maybeSingle();
  if (bookError) return NextResponse.json({ error: "Không kiểm tra được truyện." }, { status: 500 });
  if (!book) return NextResponse.json({ error: "Bạn không có quyền sửa truyện này." }, { status: 403 });

  const storage = auth.admin().storage.from("avatars");
  const { data, error } = await storage.createSignedUploadUrl(`${auth.userId}/character-${bookId}-${Date.now()}.${ext}`);
  if (error || !data) {
    console.error("[characters/avatar] createSignedUploadUrl failed:", error);
    return NextResponse.json({ error: "Không tạo được link tải ảnh." }, { status: 500 });
  }
  return NextResponse.json({ path: data.path, token: data.token, publicUrl: storage.getPublicUrl(data.path).data.publicUrl });
}
