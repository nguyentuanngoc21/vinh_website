// Trạng thái truyện ở trang giới thiệu (/truyen/[slug]) — tính RUNTIME,
// không lưu cột riêng, không cần cron: chỉ dựa vào chapters.is_last_chapter
// (đã tick "Chương cuối" chưa) và mốc 3 tháng không có chương mới. Xem
// lý do trong plan (không cần cron vì không cần lọc/sort theo status ở quy
// mô lớn — chỉ hiển thị cho 1 truyện tại 1 thời điểm).

export type BookStatus = "hoan_thanh" | "tam_ngung" | "dang_sang_tac";

export const BOOK_STATUS_LABEL: Record<BookStatus, string> = {
  hoan_thanh: "Đã hoàn thành",
  tam_ngung: "Tạm ngưng",
  dang_sang_tac: "Đang sáng tác",
};

const PAUSE_THRESHOLD_MONTHS = 3;

export function computeBookStatus(params: {
  hasPublishedLastChapter: boolean;
  /** created_at của chương published mới nhất — dùng làm tín hiệu "cập
   * nhật gần nhất" (đăng chương mới), không phải chỉnh sửa chữ chương cũ. */
  latestPublishedChapterCreatedAt: string | null;
}): BookStatus {
  if (params.hasPublishedLastChapter) return "hoan_thanh";
  if (!params.latestPublishedChapterCreatedAt) return "dang_sang_tac";

  const threshold = new Date();
  threshold.setMonth(threshold.getMonth() - PAUSE_THRESHOLD_MONTHS);

  return new Date(params.latestPublishedChapterCreatedAt) <= threshold ? "tam_ngung" : "dang_sang_tac";
}
