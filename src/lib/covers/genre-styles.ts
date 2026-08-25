import type { BookGenre } from "@/lib/supabase/types";

/**
 * Bảng cấu hình style theo thể loại cho hệ thống sinh bìa tự động —
 * THUẦN DATA, không if/else theo genre ở đâu khác trong hệ thống bìa.
 * src/lib/covers/build-cover-spec.ts đọc bảng này + hash deterministic
 * (src/lib/covers/hash.ts) để chọn ra 1 palette/layout cụ thể cho 1 sách.
 *
 * `BOOK_GENRES` (cuối file) là NGUỒN DUY NHẤT cho danh sách 10 thể loại —
 * genre-select.tsx và các route dưới api/authoring đều import lại từ đây,
 * không tự khai báo danh sách riêng (bài học từ lần đổi taxonomy 8→10
 * giá trị: từng phải sửa 3 nơi hardcode y hệt nhau).
 *
 * CHỈ dùng 2 font đã được xác nhận hỗ trợ đủ dấu tiếng Việt trong chính
 * repo này — Be Vietnam Pro (src/app/layout.tsx) và Lora (dùng lặp lại
 * per-page cho heading) — không thêm font mới. Khác biệt giữa các thể
 * loại đến từ weight/letter-spacing/hiệu ứng SVG, không phải font khác
 * nhau. Nếu sau này muốn thêm font thứ 3, PHẢI tự render chuỗi test sau
 * bằng mắt trong browser thật trước khi dùng — môi trường phát triển này
 * không có công cụ render-test glyph tự động:
 *
 *   Ăn Uống Đầy Đủ Ở Ngoài Vườn Nhà, Cô Ấy Nói: "Chuyện Này Không Dễ!"
 *
 * Kết quả kiểm tra glyph (tự ghi lại, không phải chạy lại mỗi lần):
 *   - Be Vietnam Pro (subsets latin+vietnamese): PASS — đã chạy production
 *     toàn site (src/app/layout.tsx) từ trước, chưa từng thấy vỡ dấu.
 *   - Lora (subsets latin+vietnamese): PASS — đã dùng làm heading ở ~15
 *     trang (dang-ky, dang-nhap, quen-mat-khau,...) từ trước.
 *   - Chưa có font thứ 3 nào được test/thêm.
 */

export type CoverFont = "be-vietnam-pro" | "lora";

// SVG filter/gradient áp thêm lên lớp core (chữ+nền+layout) — lớp
// "enhancement". next/og (Satori) có thể không hỗ trợ đầy đủ filter kiểu
// feTurbulence/feDisplacementMap như browser (chưa kiểm chứng được trong
// môi trường này) — nếu enhancement không hiện ở PNG, chữ/palette/layout
// (core) vẫn phải hiển thị đúng, không phụ thuộc effect để đọc được tên
// sách.
export type CoverEffect =
  | "soft-glow" // Tình cảm — halo mờ ấm quanh chữ
  | "hard-shadow" // Trinh thám, Tâm lý - tội phạm — bóng đổ cứng, không blur
  | "paper-grain" // nhiễu hạt giấy rất nhẹ (dự phòng, không genre nào dùng hiện tại)
  | "hairline-border" // Đời sống - Xã hội — viền chỉ mỏng quanh khung
  | "sepia-duotone" // Dã sử — nhiễu sepia + 2 gạch chỉ song song
  | "gradient-glow" // Cổ tích & Thần thoại, Tiên hiệp/ kiếm hiệp, Kỳ ảo — chữ tô gradient + halo màu + đốm sao
  | "distressed" // Linh dị — turbulence/displacement + vệt máu lệch
  | "comic-shadow" // bóng đổ đặc kiểu poster + vệt đường đứt nét (dự phòng)
  | "circuit-lines"; // Khoa học viễn tưởng — khung line mảnh + góc bracket kiểu HUD

export type CoverLayout = "center" | "top-heavy" | "left-aligned" | "lower-third";

export type CoverPalette = {
  from: string;
  to: string;
  text: string;
  // Màu phụ cho chi tiết hiệu ứng riêng từng effect (vệt máu của
  // "distressed", đốm sao của "gradient-glow", đường line của
  // "circuit-lines"...) — không dùng ở effect không cần.
  accent?: string;
};

export type GenreStyle = {
  font: CoverFont;
  weight: number;
  uppercase: boolean;
  letterSpacingEm: number;
  effect: CoverEffect;
  palettes: readonly CoverPalette[];
  layouts: readonly CoverLayout[];
};

// Taxonomy CHÍNH THỨC của nền tảng (10 thể loại) — thay thế hoàn toàn 8
// giá trị tạm ban đầu lấy từ mock data. Xem
// migrations/20260825_update_book_genres.sql.
export const GENRE_STYLES: Record<BookGenre, GenreStyle> = {
  "Linh dị": {
    font: "be-vietnam-pro",
    weight: 800,
    uppercase: false,
    letterSpacingEm: 0.005,
    effect: "distressed",
    palettes: [
      { from: "#1a1a1a", to: "#000000", text: "#f5f5f5", accent: "#991b1b" },
      { from: "#1c2b1c", to: "#0a0f0a", text: "#d4d4c8", accent: "#4d7c0f" },
      { from: "#450a0a", to: "#1c0505", text: "#fca5a5", accent: "#000000" },
    ],
    layouts: ["center"],
  },
  "Cổ tích & Thần thoại": {
    font: "lora",
    weight: 700,
    uppercase: false,
    letterSpacingEm: 0.01,
    effect: "gradient-glow",
    palettes: [
      { from: "#78350f", to: "#451a03", text: "#fef3c7", accent: "#fbbf24" },
      { from: "#581c87", to: "#3b0764", text: "#fde68a", accent: "#c4b5fd" },
      { from: "#7c2d12", to: "#431407", text: "#fed7aa", accent: "#fbbf24" },
    ],
    layouts: ["center"],
  },
  "Dã sử": {
    font: "be-vietnam-pro",
    weight: 700,
    uppercase: true,
    letterSpacingEm: 0.02,
    effect: "sepia-duotone",
    palettes: [
      { from: "#ea580c", to: "#9a3412", text: "#FEF3C7", accent: "#78350f" },
      { from: "#78350f", to: "#422006", text: "#FDE9C8", accent: "#292524" },
      { from: "#57534e", to: "#292524", text: "#E7E5E4", accent: "#1c1917" },
    ],
    layouts: ["center"],
  },
  "Trinh thám": {
    font: "be-vietnam-pro",
    weight: 800,
    uppercase: true,
    letterSpacingEm: -0.01,
    effect: "hard-shadow",
    palettes: [
      { from: "#0891b2", to: "#0e7490", text: "#F0FDFA" },
      { from: "#b45309", to: "#78350f", text: "#FEF3C7" },
      { from: "#1e293b", to: "#0f172a", text: "#E2E8F0" },
    ],
    layouts: ["top-heavy"],
  },
  "Tâm lý - tội phạm": {
    font: "be-vietnam-pro",
    weight: 700,
    uppercase: false,
    letterSpacingEm: 0,
    effect: "hard-shadow",
    palettes: [
      { from: "#1e293b", to: "#020617", text: "#e2e8f0", accent: "#0f172a" },
      { from: "#3f3f46", to: "#18181b", text: "#e4e4e7", accent: "#000000" },
      { from: "#134e4a", to: "#042f2e", text: "#ccfbf1", accent: "#000000" },
    ],
    layouts: ["left-aligned"],
  },
  "Tình cảm": {
    font: "lora",
    weight: 700,
    uppercase: false,
    letterSpacingEm: 0.01,
    effect: "soft-glow",
    palettes: [
      { from: "#7c3aed", to: "#4338ca", text: "#FDF4FF" },
      { from: "#1d4ed8", to: "#1e3a8a", text: "#EFF6FF" },
      { from: "#be185d", to: "#831843", text: "#FFF1F2" },
    ],
    layouts: ["center"],
  },
  "Đời sống - Xã hội": {
    font: "lora",
    weight: 700,
    uppercase: false,
    letterSpacingEm: 0,
    effect: "hairline-border",
    palettes: [
      { from: "#2563a8", to: "#1f8a6b", text: "#F8FAFC" },
      { from: "#475569", to: "#1e293b", text: "#F1F5F9" },
      { from: "#1e3a5f", to: "#0c1e35", text: "#E0E7EF" },
    ],
    layouts: ["center"],
  },
  "Khoa học viễn tưởng": {
    font: "be-vietnam-pro",
    weight: 800,
    uppercase: true,
    letterSpacingEm: 0.03,
    effect: "circuit-lines",
    palettes: [
      { from: "#0c4a6e", to: "#082f49", text: "#e0f2fe", accent: "#38bdf8" },
      { from: "#1e1b4b", to: "#0f0a2e", text: "#e0e7ff", accent: "#818cf8" },
      { from: "#083344", to: "#042f2e", text: "#ccfbf1", accent: "#2dd4bf" },
    ],
    layouts: ["center"],
  },
  "Tiên hiệp/ kiếm hiệp": {
    font: "be-vietnam-pro",
    weight: 700,
    uppercase: false,
    letterSpacingEm: 0.01,
    effect: "gradient-glow",
    palettes: [
      { from: "#7f1d1d", to: "#450a0a", text: "#fef08a", accent: "#facc15" },
      { from: "#78350f", to: "#292524", text: "#fde68a", accent: "#f59e0b" },
      { from: "#1c1917", to: "#000000", text: "#fbbf24", accent: "#dc2626" },
    ],
    layouts: ["center"],
  },
  "Kỳ ảo": {
    font: "be-vietnam-pro",
    weight: 700,
    uppercase: false,
    letterSpacingEm: 0.01,
    effect: "gradient-glow",
    palettes: [
      { from: "#0f766e", to: "#134e4a", text: "#fbbf24", accent: "#a78bfa" },
      { from: "#4c1d95", to: "#1e1b4b", text: "#fbbf24", accent: "#f0abfc" },
      { from: "#164e63", to: "#083344", text: "#fbbf24", accent: "#67e8f9" },
    ],
    layouts: ["center"],
  },
};

// Danh sách 10 thể loại, đúng thứ tự khai báo ở trên — nguồn duy nhất,
// dùng lại ở genre-select.tsx và các route api/authoring thay vì hardcode
// riêng từng nơi (property key thứ tự string luôn giữ nguyên thứ tự khai
// báo theo đặc tả ECMAScript, không cần sort/tự liệt kê lại).
export const BOOK_GENRES: BookGenre[] = Object.keys(GENRE_STYLES) as BookGenre[];

// Sách chưa gán genre (genre = null trên books), HOẶC mang 1 giá trị cũ
// không còn hợp lệ (dữ liệu tồn dư từ trước lần đổi taxonomy) — style
// trung tính, không alias ngầm sang 1 genre có sẵn vì đó sẽ ngầm gán ý
// nghĩa cho 1 giá trị đang thật sự là "chưa biết".
export const DEFAULT_COVER_STYLE: GenreStyle = {
  font: "be-vietnam-pro",
  weight: 700,
  uppercase: false,
  letterSpacingEm: 0,
  effect: "hairline-border",
  palettes: [
    { from: "#64748b", to: "#334155", text: "#F1F5F9" },
    { from: "#78716c", to: "#44403c", text: "#FAFAF9" },
  ],
  layouts: ["center"],
};

export function getGenreStyle(genre: BookGenre | null): GenreStyle {
  // genre có thể là 1 chuỗi không còn nằm trong GENRE_STYLES (dữ liệu cũ
  // trước 1 lần đổi taxonomy, hoặc string tuỳ tiện từ nơi gọi không qua
  // CHECK constraint của DB — ví dụ mock data ở src/lib/books.ts) — tra
  // bằng "in" thay vì tin genre luôn là key hợp lệ, tránh
  // GENRE_STYLES[genre] trả undefined rồi crash ở build-cover-spec.ts.
  if (genre && genre in GENRE_STYLES) {
    return GENRE_STYLES[genre];
  }
  return DEFAULT_COVER_STYLE;
}
