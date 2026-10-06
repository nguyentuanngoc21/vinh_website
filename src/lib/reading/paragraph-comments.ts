/**
 * Types + helper cho tính năng "bình luận theo đoạn" (tham khảo
 * Wattpad) — xem src/app/api/chapters/[chapterId]/comments/route.ts (API)
 * và src/components/reading/paragraph-comments-panel.tsx (UI). Reply
 * lồng CHỈ 1 CẤP: mọi ParagraphComment có parentCommentId khác null luôn
 * là reply của 1 bình luận GỐC (parentCommentId null), không có reply
 * của reply — xem migrations/archive/20260910_add_anchored_comment_replies.sql.
 */

export type ParagraphComment = {
  id: string;
  paragraphIndex: number | null;
  content: string;
  parentCommentId: string | null;
  createdAt: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  isOwn: boolean;
  /** Tác giả đã ghim (chỉ bình luận chương — paragraphIndex null). */
  isPinned: boolean;
};

/** 1 bình luận gốc kèm sẵn danh sách reply của nó (đã lọc/sắp theo giờ). */
export type ParagraphCommentThread = {
  top: ParagraphComment;
  replies: ParagraphComment[];
};

/** Chiều rộng (px) cột "Chú thích đoạn văn" trên desktop (lg+) — reader.tsx
 * chừa đúng khoảng này bằng padding phải để trang truyện bị ĐẨY sang trái
 * thay vì bị che (paragraph-comments-panel.tsx). Ở đây (module thuần) chứ
 * không ở file panel: panel được tải động, import hằng số từ đó sẽ kéo cả
 * panel vào bundle trang đọc. */
export const PARAGRAPH_COMMENTS_PANEL_WIDTH = 400;
