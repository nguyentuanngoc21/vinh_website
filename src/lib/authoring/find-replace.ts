/**
 * Find / replace for the chapter editor. Matches are [start, end) offsets in
 * the ORIGINAL text even when diacritics/case are ignored, so the editor can
 * select and replace exactly what was found. Pure.
 */
export type FindOptions = { matchCase: boolean; matchDiacritics: boolean; wholeWord: boolean };
export type Match = { start: number; end: number };

export const MAX_MATCHES = 5000;
const WORD = /[\p{L}\p{M}\p{N}_]/u;

function foldChar(c: string, o: FindOptions) {
  let f = c;
  if (!o.matchDiacritics) f = f.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D");
  if (!o.matchCase) f = f.toLocaleLowerCase("vi");
  return f;
}

/** Folded text plus, for each folded code unit, the original index it came from. */
function fold(text: string, o: FindOptions) {
  let out = "";
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const f = foldChar(text[i], o);
    for (let k = 0; k < f.length; k++) map.push(i);
    out += f;
  }
  map.push(text.length);
  return { out, map };
}

export function findMatches(rawText: string, rawQuery: string, o: FindOptions): Match[] {
  const query = rawQuery.normalize("NFC");
  if (!query) return [];
  // Not normalized: offsets must index the textarea's own value. "Chỉnh định
  // dạng" (tidy-text.ts) converts decomposed text to NFC.
  const text = rawText;
  const hay = fold(text, o);
  const needle = fold(query, o).out;
  if (!needle) return [];
  const matches: Match[] = [];
  let from = 0;
  while (matches.length < MAX_MATCHES) {
    const at = hay.out.indexOf(needle, from);
    if (at < 0) break;
    const start = hay.map[at], end = hay.map[at + needle.length - 1] + 1;
    const ok = !o.wholeWord || (!WORD.test(text[start - 1] ?? "") && !WORD.test(text[end] ?? ""));
    if (ok) matches.push({ start, end });
    from = at + Math.max(1, ok ? needle.length : 1);
  }
  return matches;
}

/** Replaces the given matches (from findMatches on the same text) in one pass. */
export function replaceMatches(text: string, matches: Match[], replacement: string): string {
  let out = "", cursor = 0;
  for (const m of [...matches].sort((a, b) => a.start - b.start)) {
    if (m.start < cursor) continue;
    out += text.slice(cursor, m.start) + replacement;
    cursor = m.end;
  }
  return out + text.slice(cursor);
}
