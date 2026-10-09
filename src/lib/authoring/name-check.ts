/**
 * "Kiểm tra tên riêng": finds spellings of registered names (characters,
 * aliases, story terms) that differ only by diacritics, case or Unicode form —
 * "Lầu Lâm" / "lâu lâm" / decomposed "Lâu Lâm" for "Lâu Lâm". Whole words
 * only. A longer registered name containing a shorter one wins, so "Lâu Lâm
 * Khư" is never reported against "Lâu Lâm". Pure; offsets index the raw text.
 */
import { findMatches } from "@/lib/authoring/find-replace";

export type NameIssue = {
  /** Spelling found in the text. */
  found: string;
  expected: string;
  kind: "diacritics" | "case" | "unicode";
  positions: { start: number; end: number }[];
};

const LOOSE = { matchCase: false, matchDiacritics: false, wholeWord: true } as const;

export function namesFrom(
  characters: { name: string; aliases: string | null; archived_at?: string | null }[],
  terms: { name: string; aliases: string | null }[],
): string[] {
  const out = new Set<string>();
  for (const x of [...characters.filter(c => !c.archived_at), ...terms]) {
    for (const n of [x.name, ...(x.aliases ?? "").split(/[,;\n]/)]) {
      const t = n.normalize("NFC").trim().replace(/\s+/g, " ");
      // Quoted aliases ("hắn") are scan rules for common words, not proper names.
      if (t.length >= 2 && !/^["“”«»「」『』]/.test(t)) out.add(t);
    }
  }
  return [...out];
}

function classify(found: string, expected: string): NameIssue["kind"] | null {
  if (found === expected) return null;
  if (found.normalize("NFC") === expected) return "unicode";
  if (found.normalize("NFC").toLocaleLowerCase("vi") === expected.toLocaleLowerCase("vi")) return "case";
  return "diacritics";
}

export function findNameIssues(text: string, names: string[]): NameIssue[] {
  // Longest first: positions claimed by a longer name are skipped for shorter ones.
  const sorted = [...new Set(names)].sort((a, b) => b.length - a.length);
  const exactSpellings = new Set(sorted);
  const claimed: { start: number; end: number }[] = [];
  const byKey = new Map<string, NameIssue>();
  for (const name of sorted) {
    for (const m of findMatches(text, name, LOOSE)) {
      if (claimed.some(c => m.start < c.end && m.end > c.start)) continue;
      claimed.push(m);
      const found = text.slice(m.start, m.end);
      // Another registered name spelled exactly like this (e.g. two characters
      // differing only by a tone mark) is not a mistake.
      if (exactSpellings.has(found)) continue;
      const kind = classify(found, name);
      if (!kind) continue;
      const key = `${found}\u0000${name}`;
      const issue = byKey.get(key) ?? { found, expected: name, kind, positions: [] };
      issue.positions.push({ start: m.start, end: m.end });
      byKey.set(key, issue);
    }
  }
  return [...byKey.values()].sort((a, b) => b.positions.length - a.positions.length || a.positions[0].start - b.positions[0].start);
}

/** Replaces every position of the given issues with the expected spelling. */
export function applyNameFixes(text: string, issues: NameIssue[]): string {
  const edits = issues.flatMap(i => i.positions.map(p => ({ ...p, to: i.expected }))).sort((a, b) => a.start - b.start);
  let out = "", cursor = 0;
  for (const e of edits) {
    if (e.start < cursor) continue;
    out += text.slice(cursor, e.start) + e.to;
    cursor = e.end;
  }
  return out + text.slice(cursor);
}
