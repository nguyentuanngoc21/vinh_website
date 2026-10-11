import type { SupabaseClient } from "@supabase/supabase-js";
import { AUDIO_MAX_BYTES, AUDIO_MIME_EXT, AUDIO_SIZE_ERROR, isOwnAudioUploadPath } from "./upload-rules";

/** Read Storage metadata, never download the audio through a Vercel function. */
export async function validateAudioUpload(
  supabase: Pick<SupabaseClient, "storage">,
  path: string,
  userId: string,
): Promise<{ error: string; status: number } | null> {
  if (!isOwnAudioUploadPath(path, userId)) {
    return { error: "Đường dẫn audio không hợp lệ.", status: 400 };
  }
  const { data, error } = await supabase.storage.from("audio-narrations").info(path);
  if (error || !data) {
    console.error("[validateAudioUpload] Storage info failed:", error);
    return { error: "Không xác minh được file audio đã tải lên. Vui lòng thử lại.", status: 400 };
  }
  if (typeof data.size !== "number" || !Number.isFinite(data.size) || data.size <= 0) {
    return { error: "File audio trống hoặc không có kích thước hợp lệ.", status: 400 };
  }
  if (data.size > AUDIO_MAX_BYTES) return { error: AUDIO_SIZE_ERROR, status: 413 };
  const ext = path.slice(path.lastIndexOf(".") + 1);
  if (!data.contentType || AUDIO_MIME_EXT[data.contentType] !== ext) {
    return { error: "Định dạng file audio không hợp lệ.", status: 400 };
  }
  return null;
}
