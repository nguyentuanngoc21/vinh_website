/**
 * Tách 1 văn bản bản thảo thô thành danh sách chương — dùng ở
 * import-manuscript-modal.tsx để xem trước (useMemo theo splitMode, không
 * gọi mạng). API bulk-insert (api/authoring/books/[bookId]/chapters) KHÔNG
 * chạy lại hàm này — nó chỉ nhận {title, content} client đã tách xong và
 * validate hình dạng/độ dài, giữ logic tách chương ở đúng 1 nơi.
 */

export type SplitMode = "chuong" | "blank" | "none";

export type DetectedChapter = {
  no: number;
  title: string;
  content: string;
  words: number;
};

export type SplitResult = {
  chapters: DetectedChapter[];
  /** true nếu phát hiện nhiều hơn MAX_DETECTED_CHAPTERS — modal phải hiện
   * banner rõ ràng, không cắt âm thầm. */
  truncated: boolean;
  /** true nếu mode "chuong" nhưng không tìm được mốc "Chương N" nào, nên
   * đã rơi về xử lý như 1 chương duy nhất. */
  fellBackToSingle: boolean;
};

export const MAX_DETECTED_CHAPTERS = 300;

const CHUONG_MARKER_RE = /^[ \t]*ch[uư]ơng[ \t]+(\d+)[ \t]*[:.\-]?[ \t]*([^\n]*)$/gim;

export function countWords(text: string): number {
  return (text.trim().match(/\S+/g) ?? []).length;
}

export function chapterWarnings(chapters: DetectedChapter[]): string[] {
  const warnings: string[] = [];
  const seen = new Set<number>();
  const duplicates = new Set<number>();
  for (const c of chapters) {
    if (seen.has(c.no)) duplicates.add(c.no);
    seen.add(c.no);
  }
  if (duplicates.size) warnings.push(`Mốc chương trùng: ${[...duplicates].join(", ")}. Hãy đọc lại và gộp nếu cùng một chương.`);
  if (chapters.some((c) => !c.content.trim())) warnings.push("Có chương chưa có nội dung.");
  if (chapters.some((c, i) => i > 0 && c.no > chapters[i - 1].no + 1)) warnings.push("Số chương bị nhảy. Hãy kiểm tra phần nội dung giữa các mốc.");
  return warnings;
}

export function mergeChapterWithNext(chapters: DetectedChapter[], index: number): DetectedChapter[] {
  if (!chapters[index] || !chapters[index + 1]) return chapters;
  const first = chapters[index], next = chapters[index + 1];
  // Retain the second title so that merging never silently removes text.
  const content = [first.content, next.title, next.content].filter(Boolean).join("\n\n");
  return [...chapters.slice(0, index), { ...first, content, words: countWords(content) }, ...chapters.slice(index + 2)];
}

export function splitChapterAt(chapters: DetectedChapter[], index: number, offset: number): DetectedChapter[] {
  const chapter = chapters[index];
  if (!chapter || !Number.isInteger(offset) || offset <= 0 || offset >= chapter.content.length) return chapters;
  const left = chapter.content.slice(0, offset), right = chapter.content.slice(offset);
  if (!left.trim() || !right.trim()) return chapters;
  return [...chapters.slice(0, index),
    { ...chapter, content: left, words: countWords(left) },
    { no: chapter.no + 1, title: `${chapter.title} (phần tiếp)`, content: right, words: countWords(right) },
    ...chapters.slice(index + 1)];
}

function capChapters(chapters: DetectedChapter[]): { chapters: DetectedChapter[]; truncated: boolean } {
  if (chapters.length <= MAX_DETECTED_CHAPTERS) {
    return { chapters, truncated: false };
  }
  return { chapters: chapters.slice(0, MAX_DETECTED_CHAPTERS), truncated: true };
}

function singleChapter(text: string): DetectedChapter[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return [{ no: 1, title: "Chương 1", content: trimmed, words: countWords(trimmed) }];
}

function splitByBlankLines(text: string): DetectedChapter[] {
  return text
    .split(/\n{3,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((content, i) => ({
      no: i + 1,
      title: `Chương ${i + 1}`,
      content,
      words: countWords(content),
    }));
}

function splitByChuongMarkers(text: string): { chapters: DetectedChapter[]; fellBack: boolean } {
  const marks: { index: number; markerEnd: number; no: number; title: string }[] = [];
  let m: RegExpExecArray | null;
  CHUONG_MARKER_RE.lastIndex = 0;
  while ((m = CHUONG_MARKER_RE.exec(text))) {
    marks.push({ index: m.index, markerEnd: m.index + m[0].length, no: Number(m[1]), title: m[2].trim() });
  }

  if (!marks.length) {
    return { chapters: singleChapter(text), fellBack: true };
  }

  const chapters: DetectedChapter[] = [];

  // Văn bản trước mốc đầu tiên (ví dụ lời mở đầu) — chỉ giữ nếu có nội dung.
  const leading = text.slice(0, marks[0].index).trim();
  if (leading) {
    chapters.push({ no: 0, title: "Mở đầu", content: leading, words: countWords(leading) });
  }

  marks.forEach((mark, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
    const content = text.slice(mark.markerEnd, end).trim();
    chapters.push({
      no: mark.no,
      title: mark.title || `Chương ${mark.no}`,
      content,
      words: countWords(content),
    });
  });

  return { chapters, fellBack: false };
}

const HEADING_TAG_RE = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;

function decodeHtmlEntities(html: string): string {
  return html
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function htmlToText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<\/(p|h[1-6]|li)>/gi, "\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Tách chương theo style "Heading" THẬT của Word — chỉ dùng được với HTML
 * do mammoth.convertToHtml() sinh ra từ 1 file .docx (mammoth tự map style
 * "Heading 1".."Heading 6" của Word sang <h1>..<h6>, xem
 * node_modules/mammoth/lib/options-reader.js). Đây là tín hiệu chắc chắn
 * hơn regex đoán chữ ở splitByChuongMarkers() — "chương trình"/"huy
 * chương" không thể vô tình mang style Heading trừ khi tác giả TỰ đánh
 * dấu nó là heading (lúc đó đúng là 1 heading thật). Chỉ hoạt động nếu
 * tác giả dùng đúng style Heading có sẵn của Word — bôi đậm/tăng size chữ
 * tay không đủ để mammoth nhận ra.
 *
 * Trả về [] nếu tìm được ít hơn 2 heading — không đáng gọi là "tách chương".
 */
export function extractHeadingChapters(html: string): DetectedChapter[] {
  const marks: { index: number; end: number; titleHtml: string }[] = [];
  let m: RegExpExecArray | null;
  HEADING_TAG_RE.lastIndex = 0;
  while ((m = HEADING_TAG_RE.exec(html))) {
    marks.push({ index: m.index, end: m.index + m[0].length, titleHtml: m[2] });
  }

  if (marks.length < 2) return [];

  const chapters = marks.map((mark, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index : html.length;
    const content = htmlToText(html.slice(mark.end, end));
    const title = htmlToText(mark.titleHtml) || `Chương ${i + 1}`;
    return { no: i + 1, title, content, words: countWords(content) };
  });
  const leading = htmlToText(html.slice(0, marks[0].index));
  if (leading) chapters.unshift({ no: 0, title: "Mở đầu", content: leading, words: countWords(leading) });
  return chapters;
}

export function splitChapters(text: string, mode: SplitMode): SplitResult {
  text = text.replace(/\r\n?/g, "\n");
  if (!text.trim()) {
    return { chapters: [], truncated: false, fellBackToSingle: false };
  }

  if (mode === "none") {
    const { chapters, truncated } = capChapters(singleChapter(text));
    return { chapters, truncated, fellBackToSingle: false };
  }

  if (mode === "blank") {
    const { chapters, truncated } = capChapters(splitByBlankLines(text));
    return { chapters, truncated, fellBackToSingle: false };
  }

  const { chapters: raw, fellBack } = splitByChuongMarkers(text);
  const { chapters, truncated } = capChapters(raw);
  return { chapters, truncated, fellBackToSingle: fellBack };
}
