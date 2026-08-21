import type { CoverFont } from "./genre-styles";

/**
 * Tên family dùng trong CSS font-family (SVG renderer,
 * generated-book-cover.tsx VÀ generated-book-cover-og.tsx) — tách riêng
 * khỏi fonts.ts (đọc file .ttf qua `fs`) vì generated-book-cover.tsx còn
 * được import từ book-cover.tsx/book-coverflow.tsx ("use client") — nếu
 * để chung 1 file, `fs`/`path` ở đầu fonts.ts bị kéo theo vào bundle
 * browser và build fail ("Module not found: Can't resolve 'fs'"). File
 * này không đụng filesystem, an toàn dùng ở cả client và server.
 */
export function coverFontFamily(font: CoverFont): string {
  return font === "lora" ? "Lora" : "Be Vietnam Pro";
}
