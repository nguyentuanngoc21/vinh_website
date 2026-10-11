import { NextResponse } from "next/server";
import { createClient, requireSupabaseUser } from "@/lib/supabase/server";
import { AUDIO_MAX_BYTES, AUDIO_MIME_EXT, AUDIO_SIZE_ERROR } from "@/lib/audio/upload-rules";

/**
 * POST /api/audio/upload-url — bước 1 của mọi luồng đăng audio (đăng độc
 * lập ở /audio/new và "Tự thu và gắn" trong trang soạn chương): cấp signed
 * upload URL để trình duyệt PUT file THẲNG lên bucket 'audio-narrations'.
 *
 * Không nhận file qua route nữa — Vercel Serverless Functions giới hạn cứng
 * body request ~4.5MB (giới hạn platform), nên file audio vài phút trở lên
 * bị Vercel trả 413 trước khi chạm tới function (không có log nào ở cả
 * Vercel lẫn Supabase). Cùng cách với api/profile/avatar/route.ts.
 *
 * Path luôn nằm trong thư mục auth.uid() — khớp policy "narrators upload
 * their own audio files" (migrations/baseline/08_audio.sql). Bước xác nhận
 * (POST /api/audio hoặc .../audio/record) kiểm lại prefix này.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const auth = await requireSupabaseUser(supabase, "Vui lòng đăng nhập để đăng tải audio.");
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const body = await request.json().catch(() => null);
  const contentType = typeof body?.contentType === "string" ? body.contentType : null;
  const ext = contentType ? AUDIO_MIME_EXT[contentType] : null;
  if (!ext) {
    return NextResponse.json({ error: "Chỉ nhận file MP3, M4A, WAV hoặc OGG." }, { status: 400 });
  }
  if (!Number.isSafeInteger(body?.size) || body.size <= 0) {
    return NextResponse.json({ error: "File audio trống hoặc không hợp lệ." }, { status: 400 });
  }
  if (body.size > AUDIO_MAX_BYTES) {
    return NextResponse.json({ error: AUDIO_SIZE_ERROR }, { status: 413 });
  }

  const path = `${user.id}/narration-${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const { data, error } = await supabase.storage.from("audio-narrations").createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[api/audio/upload-url] createSignedUploadUrl failed:", error);
    return NextResponse.json({ error: "Không tạo được link tải audio." }, { status: 500 });
  }

  return NextResponse.json({ path: data.path, token: data.token });
}
