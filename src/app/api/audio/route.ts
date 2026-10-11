import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient, requireSupabaseUser } from "@/lib/supabase/server";
import { AUDIO_GENRES } from "@/lib/audio/get-audio-catalog";
import { RewardEngine } from "@/lib/quests/reward-engine";
import { revalidatePublicAudio } from "@/lib/cache/public-data";
import { isOwnAudioUploadPath } from "@/lib/audio/upload-rules";
import { validateAudioUpload } from "@/lib/audio/validate-upload";

/**
 * POST /api/audio — diễn viên lồng tiếng tự đăng 1 bản thu ĐỘC LẬP lên
 * kho Audio (/audio/new). Bước xác nhận: file đã được trình duyệt PUT thẳng
 * lên Storage qua /api/audio/upload-url (route này chỉ nhận JSON
 * { path, title, genre, durationSeconds } — gửi file qua đây sẽ vượt giới
 * hạn body ~4.5MB của Vercel). Dùng client cookie-bound của chính họ — RLS
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
  const auth = await requireSupabaseUser(supabase, "Vui lòng đăng nhập để đăng tải audio.");
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  const genre = String(body.genre ?? "");
  const durationSeconds =
    typeof body.durationSeconds === "number" && Number.isFinite(body.durationSeconds)
      ? Math.round(body.durationSeconds)
      : null;
  const path = body.path;

  if (!title) {
    return NextResponse.json({ error: "Thiếu tiêu đề." }, { status: 400 });
  }
  if (!AUDIO_GENRES.includes(genre as (typeof AUDIO_GENRES)[number])) {
    return NextResponse.json({ error: "Vui lòng chọn thể loại hợp lệ." }, { status: 400 });
  }
  if (!isOwnAudioUploadPath(path, user.id)) {
    return NextResponse.json({ error: "Thiếu file audio." }, { status: 400 });
  }
  const uploadError = await validateAudioUpload(supabase, path, user.id);
  if (uploadError) {
    return NextResponse.json({ error: uploadError.error }, { status: uploadError.status });
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

  // KHÔNG sửa file audio — không có thư viện ghi tag ID3/Vorbis/APE nào
  // trong project và mỗi định dạng (mp3/m4a/wav/ogg) lại khác nhau, không
  // như PNG (xem migrations/archive/20260907_add_content_protection_status.sql).
  // Chỉ ghi nhận "đã tuyên bố không cho AI huấn luyện" vào DB — hiển thị
  // rõ ở UI (xem src/components/audio-hub), không giả vờ đã nhúng vào
  // file. `content_protection_status` chỉ admin đọc được (RLS) nên phải
  // dùng service-role, khác `supabase` cookie-bound ở trên. Lỗi ở đây
  // không chặn phản hồi — bản thu đã lên thật, chỉ admin dashboard đếm
  // thiếu 1 dòng.
  const serviceClient = createServiceRoleClient();
  const { error: protectionError } = await serviceClient
    .from("content_protection_status")
    .insert({ content_type: "audio", content_id: item.id, method: "declared_db_only" });
  if (protectionError) {
    console.error("[api/audio] content_protection_status insert failed:", protectionError);
  }

  const questResult = await RewardEngine.incrementTaskProgress(serviceClient, {
    userId: user.id,
    taskCode: "narrator_upload_audio",
  });
  if (!questResult.ok) {
    console.error("[api/audio] incrementTaskProgress failed:", questResult.error);
  }

  // Làm mới cache trang công khai (lib/cache/public-data.ts).
  revalidatePublicAudio();

  return NextResponse.json({ ok: true, id: item.id });
}
