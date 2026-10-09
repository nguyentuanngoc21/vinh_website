/**
 * "Chỉnh định dạng" — one-click cleanup of pasted chapter text. Only fixes
 * spacing, never rewrites the author's punctuation style (no "..." → "…",
 * no quote conversion). Design-image markers `[[...]]` and URLs are left
 * untouched. Pure.
 */
export type TidyOptions = {
  /** Treat every line break as a new paragraph (text pasted with single
   * line breaks between paragraphs — the reader splits on blank lines). */
  linesAsParagraphs: boolean;
};
export type TidyResult = { text: string; changed: boolean };

const PROTECTED = /\[\[[^\]\n]*\]\]|https?:\/\/\S+/g;
// Closing marks that hug the previous word; opening marks hug the next one.
const NO_SPACE_BEFORE = ",.;:!?…)\\]}”’»」』%";
const SPACE_AFTER = ",;:!?…";

function tidyLine(line: string) {
  return line
    .replace(/[ \t 　]+/g, " ")
    .trim()
    .replace(new RegExp(` +([${escape(NO_SPACE_BEFORE)}])`, "g"), "$1")
    .replace(/([(\[{“‘«「『]) +/g, "$1")
    // "chữ,tiếp" → "chữ, tiếp" — only before a letter, so 3,5 / 10:30 / ?! stay.
    .replace(new RegExp(`([${escape(SPACE_AFTER)}])(?=\\p{L})`, "gu"), "$1 ");
}

function escape(chars: string) {
  return chars.replace(/[\\\]^-]/g, "\\$&");
}

export function tidyChapterText(input: string, o: TidyOptions = { linesAsParagraphs: false }): TidyResult {
  const kept: string[] = [];
  let text = input.normalize("NFC").replace(/\r\n?/g, "\n")
    .replace(PROTECTED, m => `\u0000${kept.push(m) - 1}\u0000`);
  text = text.split("\n").map(tidyLine).join("\n");
  if (o.linesAsParagraphs) text = text.replace(/\n+/g, "\n\n");
  text = text.replace(/\n{3,}/g, "\n\n").replace(/^\n+|\n+$/g, "");
  text = text.replace(/\u0000(\d+)\u0000/g, (_, i) => kept[Number(i)]);
  return { text, changed: text !== input };
}
