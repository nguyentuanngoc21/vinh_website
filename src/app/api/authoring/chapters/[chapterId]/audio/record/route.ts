import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient, requireSupabaseUser } from "@/lib/supabase/server";
import { AUDIO_GENRES } from "@/lib/audio/get-audio-catalog";
import { RewardEngine } from "@/lib/quests/reward-engine";
import { revalidatePublicAudio } from "@/lib/cache/public-data";
import { isOwnAudioUploadPath } from "@/lib/audio/upload-rules";
import { validateAudioUpload } from "@/lib/audio/validate-upload";

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
 *
 * File đã được trình duyệt PUT thẳng lên Storage qua /api/audio/upload-url;
 * route này chỉ nhận JSON { path, title?, durationSeconds? } (giới hạn body
 * ~4.5MB của Vercel — xem api/audio/upload-url/route.ts).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  const { chapterId } = await params;
  const supabase = await createClient();
  const auth = await requireSupabaseUser(supabase);
  if ("response" in auth) return auth.response;
  const { user } = auth;

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

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
  }

  const titleRaw = String(body.title ?? "").trim();
  const title = titleRaw || `${book.title} — ${chapter.title}`;
  const durationSeconds =
    typeof body.durationSeconds === "number" && Number.isFinite(body.durationSeconds)
      ? Math.round(body.durationSeconds)
      : null;
  const path = body.path;

  if (!isOwnAudioUploadPath(path, user.id)) {
    return NextResponse.json({ error: "Thiếu file audio." }, { status: 400 });
  }
  const uploadError = await validateAudioUpload(supabase, path, user.id);
  if (uploadError) {
    return NextResponse.json({ error: uploadError.error }, { status: uploadError.status });
  }

  const genre = book.genre && (AUDIO_GENRES as string[]).includes(book.genre) ? book.genre : null;

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

  // KHÔNG sửa file audio — xem giải thích đầy đủ ở src/app/api/audio/route.ts.
  // Chỉ ghi nhận đã tuyên bố "không cho AI huấn luyện" vào DB. Lỗi ở đây
  // không chặn phản hồi — bản thu đã lên thật.
  const serviceClient = createServiceRoleClient();
  const { error: protectionError } = await serviceClient
    .from("content_protection_status")
    .insert({ content_type: "audio", content_id: item.id, method: "declared_db_only" });
  if (protectionError) {
    console.error("[chapter audio/record] content_protection_status insert failed:", protectionError);
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

  const questResult = await RewardEngine.incrementTaskProgress(serviceClient, {
    userId: user.id,
    taskCode: "narrator_upload_audio",
  });
  if (!questResult.ok) {
    console.error("[chapter audio/record] incrementTaskProgress failed:", questResult.error);
  }

  // Làm mới cache trang công khai (lib/cache/public-data.ts).
  revalidatePublicAudio();

  return NextResponse.json({ ok: true });
}
