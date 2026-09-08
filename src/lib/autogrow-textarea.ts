/**
 * Tự giãn chiều cao 1 <textarea> theo nội dung đang gõ (kiểu ô soạn tin
 * nhắn Messenger/Zalo) — dùng chung cho composer ở chat-tab.tsx (tab Hội
 * thoại đầy đủ) và chat-bubble-window.tsx (panel bong bóng chat nổi).
 * Đặt về "auto" trước khi đo `scrollHeight`, nếu không chiều cao cũ (đã
 * gán bằng px ở lần gọi trước) sẽ chặn scrollHeight co lại đúng khi người
 * dùng xoá bớt chữ — scrollHeight luôn được đo dựa trên chiều cao HIỆN
 * TẠI của phần tử, không phải theo nội dung thật nếu chiều cao đang bị
 * khoá bằng 1 giá trị cố định.
 */
export function autoGrowTextarea(el: HTMLTextAreaElement, maxHeightPx: number) {
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, maxHeightPx)}px`;
}

/** Gọi sau khi gửi xong (đã setDraft("")) — trả textarea về đúng 1 dòng,
 * không thì chiều cao inline style cũ (từ lần gõ dài trước đó) vẫn giữ
 * nguyên dù nội dung đã rỗng. */
export function resetTextareaHeight(el: HTMLTextAreaElement | null) {
  if (el) el.style.height = "auto";
}
