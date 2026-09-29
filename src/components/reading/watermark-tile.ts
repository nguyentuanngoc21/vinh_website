// Ô watermark tên tác giả cho trang đọc — tách từ reader.tsx (thuần chuỗi,
// không phụ thuộc React).

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export const WATERMARK_TILE_WIDTH = 220;
export const WATERMARK_TILE_HEIGHT = 110;

/** Ô SVG nhỏ chứa tên tác giả, xoay sẵn -22°, dùng làm `background-image`
 * lặp bằng `background-repeat: repeat` — kỹ thuật giống
 * `buildTiledWatermarkSvg` ở src/lib/orders/watermark.ts (ảnh giao đơn
 * Kết nối), chỉ khác là tile nhỏ để trình duyệt tự lặp vô hạn thay vì vẽ
 * hết mọi ô ra 1 SVG khổ lớn bằng đúng chiều cao nội dung — nhờ vậy phủ
 * kín được chương dài bao nhiêu cũng được, không cần biết trước chiều
 * cao thật của nó. */
export function buildAuthorWatermarkTileDataUrl(authorName: string, color: string): string {
  const label = escapeXml(`${authorName} · Vịnh`);
  const svg =
    `<svg width="${WATERMARK_TILE_WIDTH}" height="${WATERMARK_TILE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">` +
    `<text x="${WATERMARK_TILE_WIDTH / 2}" y="${WATERMARK_TILE_HEIGHT / 2}" ` +
    `transform="rotate(-22 ${WATERMARK_TILE_WIDTH / 2} ${WATERMARK_TILE_HEIGHT / 2})" ` +
    `text-anchor="middle" font-size="14" font-weight="600" font-family="sans-serif" ` +
    `fill="${color}">${label}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
