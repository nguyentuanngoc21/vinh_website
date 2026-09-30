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

/** Giờ:phút nhỏ dưới MỖI bong bóng chat trong 1 luồng đang mở — luôn chỉ
 * giờ:phút (không kèm ngày), vì ngày đã có ở dòng chia phiên
 * (sessionDividerLabel) ngay phía trên khi cần — tham khảo Zalo. */
export function messageTimeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

/** Ngưỡng coi là "phiên nhắn mới" — cách tin liền trước quá lâu (hoặc
 * khác ngày) thì chèn 1 dòng chia phiên căn giữa phía trên tin đó, tham
 * khảo Zalo. 15 phút — cùng bậc với ngưỡng grouping phổ biến ở các app
 * chat khác (WhatsApp/Messenger dùng quanh 5-15 phút). */
export const SESSION_GAP_MS = 15 * 60 * 1000;

export function isNewSession(prevIso: string | null, currentIso: string): boolean {
  if (!prevIso) return true;
  const prev = new Date(prevIso);
  const current = new Date(currentIso);
  if (prev.toDateString() !== current.toDateString()) return true;
  return current.getTime() - prev.getTime() > SESSION_GAP_MS;
}

/** Nhãn đầy đủ cho dòng chia phiên (căn giữa, phía trên tin đầu tiên của
 * phiên mới) — khác ngày thì kèm ngày/tháng, khác năm thì kèm cả năm;
 * cùng ngày hôm nay chỉ hiện giờ:phút. Tham khảo Zalo ("Hôm nay 14:32",
 * "12 thg 3 14:32"...). */
export function sessionDividerLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `Hôm nay ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Hôm qua ${time}`;
  const datePart = d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
  return `${datePart} ${time}`;
}

/** Thời gian tương đối ngắn cho bình luận (tham khảo các app đọc truyện):
 * "Vừa xong", "5 phút", "3 giờ", "2 ngày", "4 tuần"; từ 1 năm trở lên thì
 * hiện ngày/tháng/năm. `now` truyền vào để test được và để caller dùng
 * chung 1 mốc cho cả danh sách. */
export function relativeTimeLabel(iso: string, now: number = Date.now()): string {
  const diffSec = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return "Vừa xong";
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min} phút`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} giờ`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày`;
  const weeks = Math.floor(days / 7);
  if (days < 365) return weeks < 5 ? `${weeks} tuần` : `${Math.floor(days / 30)} tháng`;
  return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}
