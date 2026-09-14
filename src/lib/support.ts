/**
 * Kênh liên hệ hỗ trợ — dùng cho CTA "Liên hệ hỗ trợ" trong banner phạt
 * chụp màn hình (reader.tsx). Hiện KHÔNG có trang/kênh hỗ trợ nào khác đã
 * tồn tại sẵn trong repo để trỏ tới: `site-footer.tsx` mục "Trung tâm trợ
 * giúp" chưa có `href` (label-only, giống pattern "Sắp có" của
 * admin-sidebar.tsx), còn "Liên hệ" trỏ `/ket-noi` — đó là trang đặt dịch
 * vụ giữa người dùng, không phải kênh hỗ trợ của Vịnh.
 */
export const SUPPORT_EMAIL = "vinhcauchuyen@gmail.com";

export function supportMailto(subject: string): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
