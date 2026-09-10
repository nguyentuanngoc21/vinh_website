/**
 * Nén & resize ảnh phía client TRƯỚC KHI upload — sửa lỗi 413 Content Too
 * Large ở POST /api/auth/register và /api/profile/identity.
 *
 * Nguyên nhân 413: register-form.tsx/identity-form.tsx gửi ảnh CCCD gốc
 * (multipart FormData, không nén) — UI cho phép mỗi ảnh "dưới 5 MB" (xem
 * hint trong register-form.tsx), nên 2 ảnh (mặt trước + sau) cộng lại có
 * thể lên tới ~10MB. Vercel Serverless/Edge Functions giới hạn CỨNG body
 * request ở khoảng 4.5MB — giới hạn platform, KHÔNG sửa được bằng code
 * (next.config, route config...). Request vượt giới hạn này bị Vercel
 * reject ở lớp routing, TRƯỚC KHI chạm tới function — đúng lý do Vercel
 * không log gì và Supabase cũng không thấy request nào cả.
 *
 * Cách sửa: nén ảnh xuống dưới MAX_BYTES/ảnh ở đây trước khi set vào
 * FormData, để tổng 2 ảnh luôn nằm sâu dưới giới hạn 4.5MB. Giữ cạnh dài
 * đủ lớn (MAX_DIMENSION) để tesseract.js (src/lib/ocr.ts) vẫn đọc được số
 * CCCD sau khi nén — hạ quality trước khi hạ kích thước.
 */
const MAX_DIMENSION = 1800; // px, cạnh dài nhất sau resize
const MAX_BYTES = 1.4 * 1024 * 1024; // ~1.4MB/ảnh -> 2 ảnh ~2.8MB, còn dư nhiều so với giới hạn 4.5MB
const MIN_QUALITY = 0.5;

export async function compressImageFile(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    let quality = 0.85;
    let blob = await canvasToBlob(canvas, quality);
    while (blob && blob.size > MAX_BYTES && quality > MIN_QUALITY) {
      quality -= 0.1;
      blob = await canvasToBlob(canvas, quality);
    }

    // Nén ra to hơn bản gốc (hiếm, nhưng có thể xảy ra với ảnh đã nén kỹ
    // từ trước) hoặc canvas.toBlob thất bại -> giữ nguyên file gốc, để
    // server tự báo lỗi rõ ràng thay vì nuốt lỗi im lặng ở đây.
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], renameToJpg(file.name), { type: "image/jpeg" });
  } catch (err) {
    console.error("[compressImageFile] failed, using original file:", err);
    return file;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

function renameToJpg(name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  return `${base || "image"}.jpg`;
}
