/**
 * "Kiểm tra từ nhạy cảm" — warn-only check before publishing against the
 * admin-maintained content_flag_terms list. Whole words, any case, exact
 * diacritics (so "chết" doesn't flag "chệt"). Pure.
 */
import { findMatches } from "@/lib/authoring/find-replace";

export type FlagTerm = { term: string; note: string | null };
export type FlagMatch = { term: string; note: string | null; count: number };

const OPTIONS = { matchCase: false, matchDiacritics: true, wholeWord: true } as const;

export function findFlaggedTerms(text: string, terms: FlagTerm[]): FlagMatch[] {
  const normalized = text.normalize("NFC");
  return terms
    .map(t => ({ term: t.term, note: t.note, count: findMatches(normalized, t.term.normalize("NFC").trim(), OPTIONS).length }))
    .filter(m => m.count > 0)
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term, "vi"));
}
