/**
 * Nhãn thời gian ngắn cho 1 dòng hội thoại — giờ:phút nếu cùng ngày, ngày/
 * tháng nếu khác. Tách ra từ chat-tab.tsx để dùng chung với
 * messenger-bell.tsx (bong bóng chat ở header) — cùng 1 định dạng cho mọi
 * nơi liệt kê hội thoại, tránh lệch nhau khi 1 nơi sửa mà nơi kia quên.
 */
export function timeLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}
