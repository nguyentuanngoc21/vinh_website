/**
 * Rào truy nghiệm cho khách vãng lai (chưa đăng nhập) — dùng chung giữa
 * trang đọc chương (server, cắt `content` THẬT trước khi trả về — xem
 * src/app/read/[bookSlug]/[chapterId]/page.tsx) và trình phát audio
 * (client, chặn currentTime — xem src/lib/audio/now-playing-context.tsx).
 *
 * Khách chỉ được đọc/nghe GUEST_PREVIEW_RATIO đầu của MỖI chương/track,
 * phần còn lại luôn bị chặn cho tới khi đăng nhập (đã đăng nhập thì đọc/
 * nghe được toàn bộ, không giới hạn thêm). KHÔNG áp dụng cho chương VIP
 * (chapters.price > 0) — chương đó chặn hoàn toàn, không có preview %, xem
 * `needsPurchase` ở page.tsx.
 *
 * Với chữ: cắt `content` thật ở server rồi mới gửi về client là lớp bảo vệ
 * THẬT (không phải chỉ che bằng CSS blur — che bằng CSS vẫn để nguyên văn
 * bản trong DOM, xem được qua devtools). Với audio: file là public URL từ
 * Supabase Storage (xem comment ở now-playing-context.tsx) nên chặn
 * currentTime chỉ là rào UI, không phải bảo mật thật — chấp nhận được vì
 * đây là hạn chế có sẵn của việc dùng URL công khai, không phải lỗ hổng mới
 * do tính năng này gây ra.
 */
export const GUEST_PREVIEW_RATIO = 0.3;

export type ContentPreview = {
  /** Phần nội dung được phép gửi về client. */
  visible: string;
  /** true nếu có phần bị cắt bớt (khách chưa đăng nhập chưa đọc hết chương). */
  truncated: boolean;
};

/**
 * Cắt `content` theo tỉ lệ SỐ ĐOẠN (chia bằng "\n\n" — giống hệt cách
 * Reader hiển thị, xem reader.tsx `paragraphs = content.split("\n\n")"),
 * làm tròn lên, tối thiểu 1 đoạn hiện ra. Chương chỉ có 1 đoạn thì không
 * cắt được gì có ý nghĩa (cắt sẽ ra chuỗi rỗng hoặc y hệt bản gốc) — trả
 * nguyên văn, truncated=false, coi như chương quá ngắn để áp preview.
 */
export function buildContentPreview(
  content: string,
  ratio: number = GUEST_PREVIEW_RATIO
): ContentPreview {
  const paragraphs = content.split("\n\n");
  if (paragraphs.length <= 1) {
    return { visible: content, truncated: false };
  }
  const visibleCount = Math.max(1, Math.min(paragraphs.length - 1, Math.ceil(paragraphs.length * ratio)));
  return {
    visible: paragraphs.slice(0, visibleCount).join("\n\n"),
    truncated: visibleCount < paragraphs.length,
  };
}
