/**
 * Giới hạn độ dài nội dung 1 chương — dùng chung cho POST
 * /api/authoring/books/[bookId]/chapters (thêm hàng loạt) và PATCH
 * /api/authoring/chapters/[chapterId] (trước đây PATCH không giới hạn; chủ dự
 * án chốt 25/09/2026). App mobile đặt cùng số ở ô soạn thảo.
 */
export const MAX_CHAPTER_CONTENT_LENGTH = 200_000;
