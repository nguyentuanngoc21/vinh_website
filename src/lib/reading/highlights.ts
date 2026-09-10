/**
 * Types + helper cho tính năng highlight khi đọc — bôi đen 1 đoạn văn
 * bản để đánh dấu (riêng tư, không công khai — xem
 * public.highlights, RLS "users manage their own highlights", FOR ALL
 * auth.uid()=user_id — KHÁC anchored_comments là công khai). Cùng shape
 * neo (chapter_id + paragraph_index + char_start/char_end) với
 * anchored_comments — char offset tính trên PLAIN TEXT của đoạn văn gốc
 * (paragraphs[i], trước khi tách segment để render).
 */

export type Highlight = {
  id: string;
  paragraphIndex: number;
  charStart: number;
  charEnd: number;
};

export type TextSegment = { text: string; highlightId: string | null };

/**
 * Cắt `text` (nội dung gốc 1 đoạn văn) thành các đoạn liên tiếp theo
 * danh sách highlight của ĐÚNG đoạn đó — mỗi segment biết mình có thuộc
 * 1 highlight (kèm id, để render <mark> bấm xoá được) hay không (null).
 *
 * Đơn giản hoá cho overlap: sắp theo charStart, mỗi highlight sau bị CẮT
 * bớt nếu chồng lên highlight trước (charStart được đẩy tới charEnd của
 * highlight trước) — hiếm khi xảy ra (đánh dấu cá nhân, không phải nhiều
 * người neo chồng lên nhau như anchored_comments công khai), chấp nhận
 * đơn giản hoá này thay vì hiển thị 2 lớp màu chồng nhau.
 */
export function buildHighlightSegments(text: string, ranges: Highlight[]): TextSegment[] {
  const sorted = [...ranges].sort((a, b) => a.charStart - b.charStart);
  const segments: TextSegment[] = [];
  let cursor = 0;

  for (const h of sorted) {
    const start = Math.max(h.charStart, cursor);
    const end = Math.min(h.charEnd, text.length);
    if (start >= end) continue; // hoàn toàn bị highlight trước "nuốt" hết
    if (start > cursor) segments.push({ text: text.slice(cursor, start), highlightId: null });
    segments.push({ text: text.slice(start, end), highlightId: h.id });
    cursor = end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), highlightId: null });

  return segments.length > 0 ? segments : [{ text, highlightId: null }];
}

/**
 * Tính offset ký tự (plain text) của 1 điểm trong DOM so với điểm ĐẦU
 * `container` — dùng Range.toString() nên không quan tâm markup lồng
 * bên trong (mark/span của highlight cũ) vẫn ra đúng offset trên text
 * gốc, miễn tổng số ký tự hiển thị không đổi so với chuỗi gốc (đúng vậy
 * — chỉ bọc thêm thẻ, không thêm/bớt ký tự nào).
 */
export function textOffsetWithin(container: Node, targetNode: Node, targetOffset: number): number {
  const range = document.createRange();
  range.selectNodeContents(container);
  range.setEnd(targetNode, targetOffset);
  return range.toString().length;
}
