/** Đọc duration thật từ chính file audio (không hỏi tay, không bịa) bằng
 * cách nạp nó vào 1 thẻ <audio> ẩn và đợi loadedmetadata. Client-only
 * (dùng Audio/URL.createObjectURL) — chỉ gọi từ "use client" component. */
export function readDurationSeconds(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const cleanup = () => URL.revokeObjectURL(url);
    audio.addEventListener("loadedmetadata", () => {
      const d = Number.isFinite(audio.duration) ? Math.round(audio.duration) : null;
      cleanup();
      resolve(d);
    });
    audio.addEventListener("error", () => {
      cleanup();
      resolve(null);
    });
    audio.src = url;
  });
}
