import { NextResponse } from "next/server";
import { getUserContext, requestError } from "@/lib/mobile/request-context";
import { contestLockResponse } from "@/lib/contests/trigger-errors";
import { isUuid } from "@/lib/validation/uuid";
import {
  CHAPTER_BACKGROUND_BUCKET, CHAPTER_BACKGROUND_MAX_BYTES, CHAPTER_BACKGROUND_TYPES,
  chapterBackgroundPath, chapterBackgroundUrl, processChapterBackground,
} from "@/lib/chapter-background";

type Context = { params: Promise<{ chapterId: string }> };

/**
 * Ownership is checked here AND enforced by RLS on the update; the DB trigger
 * check_chapter_background_path pins the path to the author's own folder.
 * Chapters removed by an admin cannot be edited (same rule as PATCH ../route.ts).
 */
async function loadOwnedChapter(request: Request, chapterId: string) {
  const auth = await getUserContext(request);
  if (!auth.userId) return { response: NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 }) };
  const { data: chapter } = await auth.supabase.from("chapters")
    .select("id, book_id, background_image_path, removed_at").eq("id", chapterId).maybeSingle();
  const { data: book } = chapter
    ? await auth.supabase.from("books").select("title, author_id, deleted_at").eq("id", chapter.book_id).maybeSingle()
    : { data: null };
  if (!chapter || !book || book.author_id !== auth.userId || book.deleted_at) {
    return { response: NextResponse.json({ error: "Không tìm thấy chương." }, { status: 404 }) };
  }
  if (chapter.removed_at) {
    return { response: NextResponse.json({ error: "Chương này đã bị gỡ bởi quản trị viên — không thể sửa cho tới khi được khôi phục." }, { status: 403 }) };
  }
  return { auth, chapter, book, userId: auth.userId };
}

async function removeOldFile(admin: ReturnType<Awaited<ReturnType<typeof getUserContext>>["admin"]>, userId: string, path: string | null) {
  if (!path || !path.startsWith(`${userId}/chapter-bg-`)) return;
  const { error } = await admin.storage.from(CHAPTER_BACKGROUND_BUCKET).remove([path]);
  if (error) console.error("[chapter-background] old file cleanup failed:", error);
}

export async function POST(request: Request, { params }: Context) {
  const { chapterId } = await params;
  if (!isUuid(chapterId)) return NextResponse.json({ error: "Chương không hợp lệ." }, { status: 400 });
  let owned;
  try { owned = await loadOwnedChapter(request, chapterId); } catch (e) { return requestError(e); }
  if ("response" in owned) return owned.response;
  const { auth, chapter, book, userId } = owned;

  const form = await request.formData().catch(() => null);
  const file = form?.get("image");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Thiếu ảnh nền." }, { status: 400 });
  if (!CHAPTER_BACKGROUND_TYPES.includes(file.type)) return NextResponse.json({ error: "Chỉ nhận ảnh JPG, PNG hoặc WEBP." }, { status: 400 });
  if (file.size > CHAPTER_BACKGROUND_MAX_BYTES) return NextResponse.json({ error: "Ảnh nền tối đa 4MB." }, { status: 413 });

  let processed: Buffer;
  try { processed = await processChapterBackground(Buffer.from(await file.arrayBuffer()), book.title); }
  catch (err) {
    console.error("[chapter-background] processing failed:", err);
    return NextResponse.json({ error: "Không đọc được ảnh. Vui lòng chọn ảnh khác." }, { status: 400 });
  }

  const path = chapterBackgroundPath(userId, chapterId);
  const { error: uploadError } = await auth.supabase.storage.from(CHAPTER_BACKGROUND_BUCKET)
    .upload(path, processed, { contentType: "image/webp" });
  if (uploadError) {
    console.error("[chapter-background] upload failed:", uploadError);
    return NextResponse.json({ error: "Tải ảnh nền thất bại. Vui lòng thử lại." }, { status: 500 });
  }
  const { error: updateError } = await auth.supabase.from("chapters").update({ background_image_path: path }).eq("id", chapterId);
  if (updateError) {
    await removeOldFile(auth.admin(), userId, path);
    const locked = contestLockResponse(updateError);
    if (locked) return locked;
    console.error("[chapter-background] update failed:", updateError);
    return NextResponse.json({ error: "Không lưu được ảnh nền. Vui lòng thử lại." }, { status: 500 });
  }
  await removeOldFile(auth.admin(), userId, chapter.background_image_path);
  return NextResponse.json({ ok: true, backgroundUrl: chapterBackgroundUrl(auth.supabase, path) });
}

export async function DELETE(request: Request, { params }: Context) {
  const { chapterId } = await params;
  if (!isUuid(chapterId)) return NextResponse.json({ error: "Chương không hợp lệ." }, { status: 400 });
  let owned;
  try { owned = await loadOwnedChapter(request, chapterId); } catch (e) { return requestError(e); }
  if ("response" in owned) return owned.response;
  const { auth, chapter, userId } = owned;
  if (!chapter.background_image_path) return NextResponse.json({ ok: true, backgroundUrl: null });
  const { error } = await auth.supabase.from("chapters").update({ background_image_path: null }).eq("id", chapterId);
  if (error) {
    const locked = contestLockResponse(error);
    if (locked) return locked;
    console.error("[chapter-background] clear failed:", error);
    return NextResponse.json({ error: "Không gỡ được ảnh nền." }, { status: 500 });
  }
  await removeOldFile(auth.admin(), userId, chapter.background_image_path);
  return NextResponse.json({ ok: true, backgroundUrl: null });
}
