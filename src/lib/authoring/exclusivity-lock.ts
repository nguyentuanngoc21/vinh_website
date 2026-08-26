/**
 * "Khoá độc quyền 3 ngày" — 1 truyện đã xuất bản ở dạng độc quyền quá 3
 * ngày (tính từ books.published_at) không được chuyển lại thành tự do
 * nữa qua luồng tác giả (admin override qua
 * src/app/api/admin/books/[bookId]/route.ts vẫn bỏ qua hoàn toàn, không
 * gọi hàm này). Xem migrations/20260826_add_book_exclusivity.sql.
 *
 * Đặt trong 1 hàm thuần riêng (không gọi Date.now() trực tiếp trong
 * component) để tránh lỗi lint "Cannot call impure function during
 * render" (react-hooks/purity) khi dùng ở author-workspace.tsx — gọi qua
 * hàm này thay vì Date.now() thẳng trong thân component.
 */

export const EXCLUSIVITY_LOCK_DAYS = 3;

export function isExclusivityLocked(params: {
  isExclusive: boolean;
  published: boolean;
  publishedAt: string | null;
}): boolean {
  if (!params.isExclusive || !params.published || !params.publishedAt) return false;
  const lockedUntil = new Date(params.publishedAt).getTime() + EXCLUSIVITY_LOCK_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() >= lockedUntil;
}
