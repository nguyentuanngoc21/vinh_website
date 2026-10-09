/**
 * Finds where a character's name/aliases appear in chapter text, for the
 * author-confirmed "Nhận diện nhân vật" scan. Pure logic — no Supabase.
 *
 * Rules (agreed with the product owner):
 *   - Exact diacritics and exact case: "Ngân Hà" is a name, "ngân hà" is not.
 *   - Whole words only (Unicode letters/marks/digits), so "Lâm" never matches
 *     inside "Lâm Khư" when another registered name is that longer form.
 *   - A term registered inside double quotes — `"hắn"` — matches only when the
 *     text also has it quoted; bare hắn is ignored. All double-quote styles
 *     (" “ ” „ « » 「 」 『 』) count as the same quote.
 *   - Text is NFC-normalized first: Word/macOS paste often yields decomposed
 *     Vietnamese that looks identical but never compares equal.
 */

const QUOTE_CHARS = "\"“”„‟«»「」『』";
const QUOTE_CLASS = `[${QUOTE_CHARS}]`;
const WORD = "[\\p{L}\\p{M}\\p{N}_]";
const SNIPPET_BEFORE = 40;
const SNIPPET_AFTER = 80;

export type MentionTerm = { text: string; quoted: boolean };
export type MentionResult = { count: number; firstIndex: number; snippet: string; matched: string[] };

/** Name + comma/semicolon/newline separated aliases → distinct terms. */
export function parseMentionTerms(name: string, aliases?: string | null): MentionTerm[] {
  const seen = new Set<string>();
  const terms: MentionTerm[] = [];
  for (const raw of [name, ...(aliases ?? "").split(/[,;\n]/)]) {
    let text = raw.normalize("NFC").trim().replace(/\s+/g, " ");
    let quoted = false;
    if (text.length > 2 && QUOTE_CHARS.includes(text[0]) && QUOTE_CHARS.includes(text.at(-1)!)) {
      text = text.slice(1, -1).trim();
      quoted = true;
    }
    // Strip stray quotes left on one side only ("hắn) — treat as plain.
    if (!quoted) text = text.replace(new RegExp(`^${QUOTE_CLASS}+|${QUOTE_CLASS}+$`, "gu"), "").trim();
    const key = `${quoted ? "q" : "p"}:${text}`;
    if (!text || seen.has(key)) continue;
    seen.add(key);
    terms.push({ text, quoted });
  }
  return terms;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function termSource(term: MentionTerm) {
  const body = term.text.split(" ").map(escapeRegExp).join("\\s+");
  return term.quoted ? `${QUOTE_CLASS}\\s*${body}\\s*${QUOTE_CLASS}` : `(?<!${WORD})${body}(?!${WORD})`;
}

/**
 * Compiles one character's terms. `otherTerms` are other characters' terms:
 * a match lying inside a longer name that contains it ("Khương Dịch" inside
 * "Khương Dịch Hành") is credited to that other name, not this character.
 */
export function createMentionMatcher(terms: MentionTerm[], otherTerms: MentionTerm[] = []) {
  if (!terms.length) return () => null;
  const own = new RegExp(terms.map(termSource).join("|"), "gu");
  const ownPlain = terms.filter(t => !t.quoted).map(t => t.text);
  const blockers = otherTerms.filter(o => !o.quoted && ownPlain.some(t => o.text !== t && o.text.length > t.length && o.text.includes(t)));
  const blocker = blockers.length ? new RegExp(blockers.map(termSource).join("|"), "gu") : null;

  return (rawText: string): MentionResult | null => {
    const text = rawText.normalize("NFC");
    const blocked: [number, number][] = [];
    if (blocker) for (const m of text.matchAll(blocker)) blocked.push([m.index, m.index + m[0].length]);
    let count = 0, firstIndex = -1;
    const matched = new Set<string>();
    for (const m of text.matchAll(own)) {
      const start = m.index, end = start + m[0].length;
      if (blocked.some(([s, e]) => start >= s && end <= e)) continue;
      if (firstIndex < 0) firstIndex = start;
      count++;
      matched.add(m[0].replace(/\s+/g, " "));
    }
    if (!count) return null;
    return { count, firstIndex, snippet: snippetAt(text, firstIndex), matched: [...matched] };
  };
}

function snippetAt(text: string, index: number) {
  const from = Math.max(0, index - SNIPPET_BEFORE), to = Math.min(text.length, index + SNIPPET_AFTER);
  const body = text.slice(from, to).replace(/\s+/g, " ").trim();
  return `${from > 0 ? "…" : ""}${body}${to < text.length ? "…" : ""}`;
}
