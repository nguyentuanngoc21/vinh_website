import type { ArtStyle } from "@/lib/supabase/types";

/**
 * 10 giá trị lấy đúng từ cột "Phong cách nghệ thuật" của mega-menu
 * (src/components/nav-strip-links.tsx) — nguồn DUY NHẤT cho danh sách này,
 * nav-strip-links.tsx import lại từ đây thay vì tự khai báo riêng (cùng lý
 * do BOOK_GENRES là nguồn duy nhất cho thể loại — xem
 * src/lib/covers/genre-styles.ts). Dùng cho design_albums.art_style — mỗi
 * album 1 giá trị, chia sẻ giữa mọi ảnh trong album đó. Xem
 * migrations/20260919_add_design_albums_and_multi_upload.sql.
 */
export const ART_STYLES: { key: ArtStyle; label: string }[] = [
  { key: "anime_manga", label: "Anime / manga" },
  { key: "ban_ta_thuc", label: "Bán tả thực" },
  { key: "ta_thuc", label: "Tả thực" },
  { key: "chibi", label: "Chibi" },
  { key: "flat_vector", label: "Phẳng / vector (flat design)" },
  { key: "co_trang", label: "Cổ trang / historical" },
  { key: "dark_fantasy", label: "Dark fantasy / gothic" },
  { key: "pixel_art", label: "Pixel art" },
  { key: "painterly", label: "Tranh vẽ tay (painterly / màu nước)" },
  { key: "render_3d", label: "3D / render" },
];

export const ART_STYLE_LABEL: Record<ArtStyle, string> = Object.fromEntries(
  ART_STYLES.map((s) => [s.key, s.label])
) as Record<ArtStyle, string>;
