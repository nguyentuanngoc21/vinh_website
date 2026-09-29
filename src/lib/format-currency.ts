/** Ký hiệu tiền tệ thống nhất toàn app (quyết định 29/09/2026): "VNĐ" — thay
 * cho "đ"/"₫" từng dùng lẫn lộn giữa các màn hình. */
export const VND_UNIT = "VNĐ";

/** 120000 → "120.000 VNĐ". */
export function formatVnd(amount: number): string {
  return `${amount.toLocaleString("vi-VN")} ${VND_UNIT}`;
}
