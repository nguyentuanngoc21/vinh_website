import { readFileSync } from "fs";
import path from "path";

// Khớp đúng union next/og's ImageResponse (Satori) đòi ở fonts[].weight —
// xem node_modules/next/dist/compiled/@vercel/og/types.d.ts.
export type CoverFontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

export type CoverFontFace = {
  name: string;
  data: Buffer;
  weight: CoverFontWeight;
  style: "normal";
};

const FONT_DIR = path.join(process.cwd(), "public", "fonts", "covers");

let cached: CoverFontFace[] | null = null;

/**
 * Nạp 4 file .ttf đã vendor (xem public/fonts/covers/README.md) thành
 * shape `next/og`'s `ImageResponse` cần ({name, data, weight, style}) —
 * CHỈ dùng ở nhánh PNG (?format=png trên
 * src/app/api/books/[id]/cover/route.ts). Nhánh SVG thường không đụng
 * tới file này — SVG render trong browser dùng font qua CSS
 * font-family, browser tự tải font bình thường.
 *
 * fs.readFileSync yêu cầu route chạy Node.js runtime, không phải Edge —
 * xem `export const runtime = "nodejs"` ở route.ts. Cache trong module
 * vì nội dung file không đổi giữa các request cùng 1 process.
 */
export function loadCoverFonts(): CoverFontFace[] {
  if (cached) return cached;
  cached = [
    {
      name: "Be Vietnam Pro",
      data: readFileSync(path.join(FONT_DIR, "BeVietnamPro-700.ttf")),
      weight: 700,
      style: "normal",
    },
    {
      name: "Be Vietnam Pro",
      data: readFileSync(path.join(FONT_DIR, "BeVietnamPro-800.ttf")),
      weight: 800,
      style: "normal",
    },
    {
      name: "Lora",
      data: readFileSync(path.join(FONT_DIR, "Lora-600.ttf")),
      weight: 600,
      style: "normal",
    },
    {
      name: "Lora",
      data: readFileSync(path.join(FONT_DIR, "Lora-700.ttf")),
      weight: 700,
      style: "normal",
    },
  ];
  return cached;
}
