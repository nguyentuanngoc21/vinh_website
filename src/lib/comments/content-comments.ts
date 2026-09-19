/**
 * Types + helper cho bình luận thiết kế/audio (khác bình luận theo đoạn
 * của reader — src/lib/reading/paragraph-comments.ts — vì không có khái
 * niệm "đoạn văn", chỉ 1 danh sách thread cho toàn bộ tác phẩm). Reply
 * lồng CHỈ 1 CẤP, cùng quy ước với paragraph comments — xem
 * migrations/20260917_add_design_audio_comments.sql.
 */

export type ContentComment = {
  id: string;
  content: string;
  parentCommentId: string | null;
  createdAt: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  isOwn: boolean;
  likeCount: number;
  liked: boolean;
};

export type ContentCommentThread = {
  top: ContentComment;
  replies: ContentComment[];
};

/** Nhóm danh sách bình luận PHẲNG (nguyên trạng từ API) thành thread (gốc
 * kèm reply). Bỏ qua reply mồ côi (lý thuyết không xảy ra — FK on delete
 * cascade), giữ nhánh này chỉ để không crash nếu có lệch dữ liệu. */
export function groupContentComments(comments: ContentComment[]): ContentCommentThread[] {
  const repliesByParent = new Map<string, ContentComment[]>();
  for (const c of comments) {
    if (!c.parentCommentId) continue;
    const list = repliesByParent.get(c.parentCommentId) ?? [];
    list.push(c);
    repliesByParent.set(c.parentCommentId, list);
  }

  const threads: ContentCommentThread[] = [];
  for (const c of comments) {
    if (c.parentCommentId) continue;
    threads.push({ top: c, replies: repliesByParent.get(c.id) ?? [] });
  }
  return threads;
}
