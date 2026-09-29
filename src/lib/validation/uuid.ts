// Kiểm tra chuỗi có đúng định dạng UUID (8-4-4-4-12 ký tự hex, không phân
// biệt hoa/thường). Dùng trước khi đưa id từ URL/body vào truy vấn Supabase:
// id sai định dạng thì trả 400/404 luôn thay vì để Postgres báo lỗi kiểu (500).
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
