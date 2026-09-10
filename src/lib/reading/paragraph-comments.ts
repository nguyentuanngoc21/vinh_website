/**
 * Types + helper cho tính năng "bình luận theo đoạn" (tham khảo
 * Wattpad) — xem src/app/api/chapters/[chapterId]/comments/route.ts (API)
 * và src/components/reading/paragraph-comments-panel.tsx (UI). Reply
 * lồng CHỈ 1 CẤP: mọi ParagraphComment có parentCommentId khác null luôn
 * là reply của 1 bình luận GỐC (parentCommentId null), không có reply
 * của reply — xem migrations/20260910_add_anchored_comment_replies.sql.
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
};

/** 1 bình luận gốc kèm sẵn danh sách reply của nó (đã lọc/sắp theo giờ). */
export type ParagraphCommentThread = {
  top: ParagraphComment;
  replies: ParagraphComment[];
};

/**
 * Nhóm danh sách bình luận PHẲNG (nguyên trạng từ API) thành:
 *   - `countByParagraph`: số lượng bình luận (gốc + reply) mỗi đoạn — để
 *     hiện số trên icon "+" mà KHÔNG cần mở panel.
 *   - `threadsByParagraph`: danh sách thread (gốc kèm reply) mỗi đoạn —
 *     chỉ cần khi panel của đoạn đó đang mở.
 * Bỏ qua reply mồ côi (parentCommentId trỏ tới 1 id không có trong danh
 * sách — lý thuyết không xảy ra vì FK on delete cascade, giữ nhánh này
 * chỉ để không crash nếu có lệch dữ liệu).
 */
export function groupParagraphComments(comments: ParagraphComment[]): {
  countByParagraph: Map<number, number>;
  threadsByParagraph: Map<number, ParagraphCommentThread[]>;
} {
  const repliesByParent = new Map<string, ParagraphComment[]>();
  for (const c of comments) {
    if (!c.parentCommentId) continue;
    const list = repliesByParent.get(c.parentCommentId) ?? [];
    list.push(c);
    repliesByParent.set(c.parentCommentId, list);
  }

  const countByParagraph = new Map<number, number>();
  const threadsByParagraph = new Map<number, ParagraphCommentThread[]>();

  for (const c of comments) {
    if (c.paragraphIndex === null) continue;
    countByParagraph.set(c.paragraphIndex, (countByParagraph.get(c.paragraphIndex) ?? 0) + 1);

    if (c.parentCommentId) continue; // đã được gộp vào thread của cha ở dưới
    const thread: ParagraphCommentThread = { top: c, replies: repliesByParent.get(c.id) ?? [] };
    const list = threadsByParagraph.get(c.paragraphIndex) ?? [];
    list.push(thread);
    threadsByParagraph.set(c.paragraphIndex, list);
  }

  return { countByParagraph, threadsByParagraph };
}
