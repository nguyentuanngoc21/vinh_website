import { createClient } from "@/lib/supabase/client";
import { AUDIO_MAX_BYTES, AUDIO_MIME_EXT, AUDIO_SIZE_ERROR } from "./upload-rules";

/**
 * Client-side: xin signed upload URL rồi PUT file thẳng lên Storage (bỏ qua
 * giới hạn body ~4.5MB của Vercel — xem api/audio/upload-url/route.ts).
 * Trả về `path` để gửi cho bước xác nhận.
 */
export async function uploadAudioFile(file: File): Promise<{ path: string } | { error: string }> {
  if (file.size <= 0) return { error: "File audio trống." };
  if (file.size > AUDIO_MAX_BYTES) return { error: AUDIO_SIZE_ERROR };
  if (!AUDIO_MIME_EXT[file.type]) return { error: "Chỉ nhận file MP3, M4A, WAV hoặc OGG." };
  const res = await fetch("/api/audio/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType: file.type, size: file.size }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.path || !data?.token) {
    return { error: (data && data.error) || "Không tạo được link tải audio." };
  }

  const { error } = await createClient()
    .storage.from("audio-narrations")
    .uploadToSignedUrl(data.path, data.token, file, { contentType: file.type });
  if (error) {
    console.error("[uploadAudioFile] upload failed:", error);
    return { error: `Tải audio thất bại: ${error.message}` };
  }
  return { path: data.path };
}
