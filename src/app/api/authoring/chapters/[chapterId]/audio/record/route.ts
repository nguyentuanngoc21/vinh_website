import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AUDIO_GENRES } from "@/lib/audio/get-audio-catalog";

const AUDIO_MAX_BYTES = 60 * 1024 * 1024;
const ALLOWED_MIME_EXT: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
};

/**
 * POST /api/authoring/chapters/:chapterId/audio/record — tác giả tự thu
 * và gắn NGAY cho chương của chính mình, trong 1 lần bấm (2 bước liền
 * nhau, tự có share_token vì vừa tạo xong nên không cần dán link tay) —
 * đúng luồng "Tác giả tự upload từ máy" mô tả ở docs/supabase/schema.sql
 * phần 9 (mục "Cách app dùng"). source: 'story_upload', genre lấy thẳng
 * từ genre của sách (không hỏi lại). Khác /api/audio (đăng ĐỘC LẬP lên
 * kho Audio, không gắn chương nào) và
 * /api/authoring/chapters/[chapterId]/audio/link (gắn bản thu của NGƯỜI
 * KHÁC qua share link).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  const { chapterId } = await params;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
  }

  const { data: chapter } = await supabase
    .from("chapters")
    .select("id, book_id, title")
    .eq("id", chapterId)
    .maybeSingle();
  if (!chapter) {
    return NextResponse.json({ error: "Không tìm thấy chương." }, { status: 404 });
  }
  const { data: book } = await supabase
    .from("books")
    .select("id, title, genre, author_id, deleted_at")
    .eq("id", chapter.book_id)
    .maybeSingle();
  if (!book || book.author_id !== user.id || book.deleted_at) {
    return NextResponse.json({ error: "Bạn không sở hữu sách chứa chương này." }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
  }

  const titleRaw = String(form.get("title") ?? "").trim();
  const title = titleRaw || `${book.title} — ${chapter.title}`;
  const durationRaw = form.get("durationSeconds");
  const durationSeconds =
    typeof durationRaw === "string" && Number.isFinite(Number(durationRaw)) ? Math.round(Number(durationRaw)) : null;
  const file = form.get("audio");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Thiếu file audio." }, { status: 400 });
  }
  const ext = ALLOWED_MIME_EXT[file.type];
  if (!ext) {
    return NextResponse.json({ error: "Chỉ nhận file MP3, M4A, WAV hoặc OGG." }, { status: 400 });
  }
  if (file.size > AUDIO_MAX_BYTES) {
    return NextResponse.json({ error: "File audio tối đa 60MB." }, { status: 400 });
  }

  const genre = book.genre && (AUDIO_GENRES as string[]).includes(book.genre) ? book.genre : null;

  const path = `${user.id}/chapter-${chapterId}-${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("audio-narrations")
    .upload(path, file, { contentType: file.type });
  if (uploadError) {
    console.error("[chapter audio/record] upload failed:", uploadError);
    return NextResponse.json({ error: `Tải audio thất bại: ${uploadError.message}` }, { status: 500 });
  }

  const { data: item, error: insertError } = await supabase
    .from("audio_narrations")
    .insert({
      narrator_id: user.id,
      title,
      genre,
      audio_url: path,
      duration_seconds: durationSeconds,
      source: "story_upload",
    })
    .select("id, share_token")
    .single();
  if (insertError || !item) {
    console.error("[chapter audio/record] insert failed:", insertError);
    return NextResponse.json({ error: "Lưu bản thu thất bại." }, { status: 500 });
  }

  const { error: linkError } = await supabase.rpc("link_audio_to_chapter", {
    p_chapter_id: chapterId,
    p_audio_narration_id: item.id,
    p_share_token: item.share_token,
  });
  if (linkError) {
    console.error("[chapter audio/record] link failed:", linkError);
    return NextResponse.json({ error: `Gắn audio thất bại: ${linkError.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
