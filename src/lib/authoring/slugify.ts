/**
 * Sinh slug cho books.slug (unique not null, docs/supabase/schema.sql) từ
 * tiêu đề tiếng Việt. Không có helper nào tương tự trong repo trước đây —
 * slug hiện tại chỉ được set tay qua migration/seed data.
 *
 * Thêm hậu tố ngẫu nhiên ngắn để đảm bảo unique mà không cần round-trip
 * kiểm tra trùng với DB trước khi insert (2 tác giả đặt cùng tên truyện
 * vẫn ra 2 slug khác nhau) — nếu hậu tố trùng nhau cực hiếm gặp, insert
 * sẽ lỗi unique constraint, gọi lại slugifyTitle() lần nữa là đủ (không
 * cần retry-loop phức tạp cho xác suất gần như không xảy ra này).
 */
export function slugifyTitle(title: string): string {
  const base = title
    // NFD không tách riêng được đ/Đ (không phải ký tự tổ hợp) — xử lý tay
    // trước khi normalize, tách dấu thanh điệu (ă/â/ê/ô/ơ/ư + sắc/huyền/
    // hỏi/ngã/nặng) bằng ̀-ͯ (dải Unicode "Combining Diacritical
    // Marks") sau khi normalize.
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60)
    .replace(/^-+|-+$/g, "");

  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base || "truyen"}-${suffix}`;
}
