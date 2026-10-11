// Dùng chung cho client (audio-upload-form, chapter-audio-panel) và các
// route đăng audio — không import gì phía trình duyệt/server.

export const AUDIO_MAX_BYTES = 50 * 1024 * 1024;
export const AUDIO_SIZE_ERROR = "File audio tối đa 50 MB.";

export const AUDIO_MIME_EXT: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3", // một số trình duyệt Android báo mp3 thế này
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/ogg": "ogg",
};

/** Path do /api/audio/upload-url cấp có đúng thư mục của user này không. */
export function isOwnAudioUploadPath(path: unknown, userId: string): path is string {
  if (typeof path !== "string" || !path.startsWith(`${userId}/`)) return false;
  const name = path.slice(userId.length + 1);
  if (!/^narration-[\d]+(?:-[a-f\d-]+)?\.(mp3|m4a|wav|ogg)$/.test(name)) return false;
  const ext = name.slice(name.lastIndexOf(".") + 1);
  return Object.values(AUDIO_MIME_EXT).includes(ext);
}
