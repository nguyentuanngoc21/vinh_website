/**
 * The small formatting subset the chapter editor's toolbar writes into
 * chapters.content (plain text, paragraphs split by "\n\n") and the reader
 * renders. Before this module the reader showed the markers raw.
 *
 * Block level — decided per paragraph, so paragraph indexes (comments,
 * highlights, reading progress) never shift:
 *   "## Tiêu đề"           → heading
 *   "> dòng" (every line)  → quote
 *   "---", "***", "* * *"  → scene break
 * Inline: **đậm**, *nghiêng* (no space just inside the markers; `\*` keeps
 * a literal asterisk).
 *
 * Highlights store offsets on the DISPLAY text (markers removed), because
 * the reader computes them from the rendered DOM.
 */

export type BlockKind = "paragraph" | "heading" | "quote" | "divider";
export type FormatRange = { start: number; end: number; bold?: boolean; italic?: boolean };
export type FormattedBlock = { kind: BlockKind; text: string; ranges: FormatRange[] };

const DIVIDER = /^\s*(?:-{3,}|\*{3,}|(?:\*\s+){2,}\*|(?:-\s+){2,}-)\s*$/;
const HEADING = /^#{1,3}\s+/;
const QUOTE_LINE = /^>\s?/;

export function parseBlock(paragraph: string): FormattedBlock {
  if (DIVIDER.test(paragraph)) return { kind: "divider", text: "", ranges: [] };
  const firstLine = paragraph.replace(/^\n+/, "");
  if (HEADING.test(firstLine) && !firstLine.includes("\n")) {
    return { kind: "heading", ...parseInline(firstLine.replace(HEADING, "")) };
  }
  const lines = paragraph.split("\n");
  const nonEmpty = lines.filter(l => l.trim());
  if (nonEmpty.length && nonEmpty.every(l => QUOTE_LINE.test(l))) {
    return { kind: "quote", ...parseInline(lines.map(l => l.replace(QUOTE_LINE, "")).join("\n")) };
  }
  return { kind: "paragraph", ...parseInline(paragraph) };
}

/**
 * Removes inline markers and returns the ranges they covered. Markers must
 * hug non-space text (`**a**`, not `** a **`) so stray asterisks such as
 * "5 * 3" or a lone "*" stay as typed.
 */
export function parseInline(source: string): { text: string; ranges: FormatRange[] } {
  let text = "";
  const ranges: FormatRange[] = [];
  let i = 0;
  while (i < source.length) {
    if (source[i] === "\\" && source[i + 1] === "*") { text += "*"; i += 2; continue; }
    if (source[i] === "*") {
      const strong = source[i + 1] === "*";
      const marker = strong ? "**" : "*";
      const open = i + marker.length;
      const close = findClose(source, open, marker);
      if (close > open) {
        const inner = parseInline(source.slice(open, close));
        const start = text.length;
        for (const r of inner.ranges) ranges.push({ ...r, start: r.start + start, end: r.end + start });
        text += inner.text;
        ranges.push({ start, end: text.length, ...(strong ? { bold: true } : { italic: true }) });
        i = close + marker.length;
        continue;
      }
    }
    text += source[i];
    i++;
  }
  return { text, ranges };
}

function findClose(source: string, from: number, marker: string) {
  if (from >= source.length || /\s/.test(source[from])) return -1;
  for (let j = from + 1; j <= source.length - marker.length; j++) {
    if (source[j] === "\n" && source[j + 1] === "\n") return -1;
    if (source.startsWith(marker, j) && !/\s/.test(source[j - 1]) && source[j - 1] !== "\\") {
      // "**" must not be read as two italics closing early, and "*a**" is not italic.
      if (marker === "*" && (source[j + 1] === "*" || source[j - 1] === "*")) continue;
      return j;
    }
  }
  return -1;
}

/** Display text of a paragraph (markers removed) — for excerpts, snippets, copy. */
export function displayText(paragraph: string): string {
  return parseBlock(paragraph).text;
}

export type StyledSegment = { text: string; bold: boolean; italic: boolean; highlightId: string | null };

/**
 * Splits display text at every format and highlight boundary so the reader
 * can wrap each piece in at most one <mark> plus <strong>/<em>.
 */
export function buildStyledSegments(
  text: string,
  ranges: FormatRange[],
  highlights: { id: string; charStart: number; charEnd: number }[] = [],
): StyledSegment[] {
  const cuts = new Set([0, text.length]);
  for (const r of ranges) { cuts.add(r.start); cuts.add(r.end); }
  // Same overlap rule as buildHighlightSegments: a later highlight is trimmed.
  const marks: { id: string; start: number; end: number }[] = [];
  let cursor = 0;
  for (const h of [...highlights].sort((a, b) => a.charStart - b.charStart)) {
    const start = Math.max(h.charStart, cursor), end = Math.min(h.charEnd, text.length);
    if (start >= end) continue;
    marks.push({ id: h.id, start, end }); cursor = end;
    cuts.add(start); cuts.add(end);
  }
  const points = [...cuts].filter(p => p >= 0 && p <= text.length).sort((a, b) => a - b);
  const segments: StyledSegment[] = [];
  for (let k = 0; k < points.length - 1; k++) {
    const a = points[k], b = points[k + 1];
    if (a === b) continue;
    const covering = ranges.filter(r => r.start <= a && r.end >= b);
    const seg = {
      text: text.slice(a, b),
      bold: covering.some(r => r.bold),
      italic: covering.some(r => r.italic),
      highlightId: marks.find(m => m.start <= a && m.end >= b)?.id ?? null,
    };
    const prev = segments.at(-1);
    if (prev && prev.bold === seg.bold && prev.italic === seg.italic && prev.highlightId === seg.highlightId) prev.text += seg.text;
    else segments.push(seg);
  }
  return segments.length ? segments : [{ text, bold: false, italic: false, highlightId: null }];
}
