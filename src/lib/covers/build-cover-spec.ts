import type { BookGenre } from "@/lib/supabase/types";
import { hashString, pick } from "./hash";
import {
  getGenreStyle,
  type CoverEffect,
  type CoverFont,
  type CoverLayout,
  type CoverPalette,
} from "./genre-styles";
import { estimateAvgGlyphWidthEm, fitTitle } from "./text-fit";

export type BuildCoverSpecInput = {
  // Seed cho hash deterministic (src/lib/covers/hash.ts) — dùng book id
  // (uuid, ổn định), KHÔNG dùng title (tác giả sửa title thì bìa vẫn giữ
  // nguyên biến thể đã chọn, đúng ý "không đổi mỗi lần load lại").
  id: string;
  title: string;
  author?: string | null;
  genre: BookGenre | null;
};

// Kết quả đã "resolve" xong mọi lựa chọn ngẫu nhiên-nhưng-ổn-định — không
// còn phụ thuộc hash/random gì nữa, chỉ còn dữ liệu thuần để render.
// Không phụ thuộc kích thước hiển thị thật (thumbnail/detail/OG chỉ scale
// theo viewBox — xem src/components/covers/generated-book-cover.tsx).
export type CoverSpec = {
  font: CoverFont;
  weight: number;
  uppercase: boolean;
  letterSpacingEm: number;
  effect: CoverEffect;
  layout: CoverLayout;
  palette: CoverPalette;
  rotationDeg: number;
  // Seed số nguyên ổn định cho các chi tiết hiệu ứng cần 1 con số ngẫu
  // nhiên-nhưng-cố-định (feTurbulence seed, jitter theo dòng ở "Kinh dị",
  // vị trí đốm sao ở "Kỳ ảo"...) — không tái dùng rotationDeg/palette
  // index cho việc này để tránh tương quan giữa các lựa chọn.
  effectSeed: number;
  title: {
    fontSize: number;
    lines: string[];
  };
  author: string | null;
};

// Khung logic dùng để auto-fit chữ, tính theo viewBox chuẩn 480×720 (2:3)
// — chừa lề trái/phải trong khung đó. Đổi viewBox thật ở
// generated-book-cover.tsx không cần đổi số này, vì SVG scale theo tỉ lệ.
const TITLE_BOX_WIDTH = 380;
const TITLE_MAX_LINES = 3;
const BASE_FONT_SIZE = 52;
const MIN_FONT_SIZE = 24;

const ROTATION_OPTIONS = [-4, -2, 0, 2, 4] as const;

export function buildCoverSpec(input: BuildCoverSpecInput): CoverSpec {
  const style = getGenreStyle(input.genre);
  const palette = pick(input.id, "palette", style.palettes);
  const layout = pick(input.id, "layout", style.layouts);

  // Chỉ effect "distressed" (Kinh dị) dùng nghiêng nhẹ theo hash — genre
  // khác giữ thẳng, tránh rotation vô nghĩa cho genre không cần (ví dụ
  // "Văn học" nghiêng sẽ trông sai tông).
  const rotationDeg =
    style.effect === "distressed" ? pick(input.id, "rotation", ROTATION_OPTIONS) : 0;
  const effectSeed = hashString(`${input.id}:effect-seed`) % 1000;

  const avgGlyphWidthEm = estimateAvgGlyphWidthEm(style.font, style.weight);
  const title = fitTitle(
    input.title,
    { width: TITLE_BOX_WIDTH, maxLines: TITLE_MAX_LINES },
    {
      baseFontSize: BASE_FONT_SIZE,
      minFontSize: MIN_FONT_SIZE,
      avgGlyphWidthEm,
      uppercase: style.uppercase,
      letterSpacingEm: style.letterSpacingEm,
    }
  );

  return {
    font: style.font,
    weight: style.weight,
    uppercase: style.uppercase,
    letterSpacingEm: style.letterSpacingEm,
    effect: style.effect,
    layout,
    palette,
    rotationDeg,
    effectSeed,
    title,
    author: input.author?.trim() || null,
  };
}
