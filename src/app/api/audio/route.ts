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
 * POST /api/audio — diễn viên lồng tiếng tự đăng 1 bản thu ĐỘC LẬP lên
 * kho Audio (/audio/new). Dùng client cookie-bound của chính họ — RLS
 * "narrators insert their own audio narrations" đã đủ, và bucket
 * 'audio-narrations' yêu cầu path bắt đầu bằng đúng auth.uid() của người
 * upload (xem docs/supabase/schema.sql phần 9, storage policies).
 *
 * Bản thu qua đây luôn là source: 'independent' (chưa gắn chương nào).
 * Muốn gắn vào 1 chương sách cụ thể: gửi link chia sẻ (hiện ở "Bản thu
 * của tôi" ngay dưới form này, xem src/components/audio-hub/my-narrations-list.tsx)
 * cho tác giả, hoặc tác giả tự thu thẳng từ trang soạn chương của họ (xem
 * src/components/author/chapter-audio-panel.tsx) — 2 luồng đó tạo ra
 * source: 'story_upload' thay vì đi qua route này.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return NextResponse.json({ error: "Vui lòng đăng nhập để đăng tải audio." }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
  }

  const title = String(form.get("title") ?? "").trim();
  const genre = String(form.get("genre") ?? "");
  const durationRaw = form.get("durationSeconds");
  const durationSeconds =
    typeof durationRaw === "string" && Number.isFinite(Number(durationRaw)) ? Math.round(Number(durationRaw)) : null;
  const file = form.get("audio");

  if (!title) {
    return NextResponse.json({ error: "Thiếu tiêu đề." }, { status: 400 });
  }
  if (!AUDIO_GENRES.includes(genre as (typeof AUDIO_GENRES)[number])) {
    return NextResponse.json({ error: "Vui lòng chọn thể loại hợp lệ." }, { status: 400 });
  }
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

  const path = `${user.id}/narration-${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("audio-narrations")
    .upload(path, file, { contentType: file.type });
  if (uploadError) {
    console.error("[api/audio] upload failed:", uploadError);
    return NextResponse.json({ error: `Tải audio thất bại: ${uploadError.message}` }, { status: 500 });
  }

  const { data: item, error: insertError } = await supabase
    .from("audio_narrations")
    .insert({
      narrator_id: user.id,
      title,
      genre: genre as (typeof AUDIO_GENRES)[number],
      audio_url: path,
      duration_seconds: durationSeconds,
      source: "independent",
    })
    .select("id")
    .single();
  if (insertError || !item) {
    console.error("[api/audio] insert failed:", insertError);
    return NextResponse.json({ error: "Đăng bản thu thất bại." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: item.id });
}
