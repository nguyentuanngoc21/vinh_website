import type { BookGenre } from "@/lib/supabase/types";

/**
 * Bảng cấu hình style theo thể loại cho hệ thống sinh bìa tự động —
 * THUẦN DATA, không if/else theo genre ở đâu khác trong hệ thống bìa.
 * src/lib/covers/build-cover-spec.ts đọc bảng này + hash deterministic
 * (src/lib/covers/hash.ts) để chọn ra 1 palette/layout cụ thể cho 1 sách.
 *
 * CHỈ dùng 2 font đã được xác nhận hỗ trợ đủ dấu tiếng Việt trong chính
 * repo này — Be Vietnam Pro (src/app/layout.tsx) và Lora (dùng lặp lại
 * per-page cho heading) — không thêm font mới. Khác biệt giữa các thể
 * loại đến từ weight/letter-spacing/hiệu ứng SVG, không phải font khác
 * nhau. Nếu sau này muốn thêm font thứ 3 (đặc biệt cho "Kinh dị"), PHẢI tự
 * render chuỗi test sau bằng mắt trong browser thật trước khi dùng — môi
 * trường phát triển này không có công cụ render-test glyph tự động:
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
  | "soft-glow" // Ngôn tình — halo mờ ấm quanh chữ
  | "hard-shadow" // Trinh thám — bóng đổ cứng, không blur
  | "paper-grain" // Tản văn — nhiễu hạt giấy rất nhẹ
  | "hairline-border" // Văn học — viền chỉ mỏng quanh khung
  | "sepia-duotone" // Lịch sử — nhiễu sepia + 2 gạch chỉ song song
  | "gradient-glow" // Kỳ ảo — chữ tô gradient + halo màu + đốm sao
  | "distressed" // Kinh dị — turbulence/displacement + vệt máu lệch
  | "comic-shadow"; // Phiêu lưu — bóng đổ đặc kiểu poster + vệt đường đứt nét

export type CoverLayout = "center" | "top-heavy" | "left-aligned" | "lower-third";

export type CoverPalette = {
  from: string;
  to: string;
  text: string;
  // Màu phụ cho chi tiết hiệu ứng riêng từng effect (vệt máu của
  // "distressed", đốm sao của "gradient-glow"...) — không dùng ở effect
  // không cần.
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

// 3 palette/genre (2 lấy từ gradient mock đang dùng ở src/lib/books.ts để
// giữ liên tục hình ảnh, 1 tự chọn thêm cho đa dạng) — riêng Kinh dị/Phiêu
// lưu không có gradient mock sẵn (chưa từng gán cho sách nào trong mock),
// nên cả 3 đều tự chọn mới.
export const GENRE_STYLES: Record<BookGenre, GenreStyle> = {
  "Ngôn tình": {
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
  "Tản văn": {
    font: "lora",
    weight: 600,
    uppercase: false,
    letterSpacingEm: 0.015,
    effect: "paper-grain",
    palettes: [
      { from: "#db2777", to: "#9d174d", text: "#FFF1F2" },
      { from: "#78350f", to: "#451a03", text: "#FEF3C7" },
      { from: "#334155", to: "#1e293b", text: "#F1F5F9" },
    ],
    layouts: ["left-aligned"],
  },
  "Văn học": {
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
  "Lịch sử": {
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
  "Kinh dị": {
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
  "Phiêu lưu": {
    font: "be-vietnam-pro",
    weight: 700,
    uppercase: true,
    letterSpacingEm: 0.025,
    effect: "comic-shadow",
    palettes: [
      { from: "#ea580c", to: "#7c2d12", text: "#FFF7ED", accent: "#1c1917" },
      { from: "#0e7490", to: "#164e63", text: "#ECFEFF", accent: "#082f36" },
      { from: "#166534", to: "#14532d", text: "#F0FDF4", accent: "#052e16" },
    ],
    layouts: ["lower-third"],
  },
};

// Sách chưa gán genre (genre = null trên books) — style trung tính, không
// alias ngầm sang 1 genre có sẵn (ví dụ "Văn học") vì đó sẽ ngầm gán ý
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
  return genre ? GENRE_STYLES[genre] : DEFAULT_COVER_STYLE;
}
