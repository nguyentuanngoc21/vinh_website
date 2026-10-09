import type { StoryTerm, StoryTermKind } from "@/lib/supabase/types";

export type { StoryTerm, StoryTermKind } from "@/lib/supabase/types";

export const TERM_KIND_LABEL: Record<StoryTermKind, string> = {
  place: "Địa danh", item: "Vật phẩm", skill: "Chiêu thức", organization: "Tổ chức", other: "Khác",
};
export const TERM_FIELDS = "id, kind, name, aliases, description, pinned";
const LIMITS = { name: 60, aliases: 200, description: 2000 } as const;
const LABELS = { name: "Tên", aliases: "Tên khác", description: "Mô tả" } as const;

type TermInput = Partial<Omit<StoryTerm, "id">>;

/** Same rules as the story_terms CHECK constraints; never truncates. */
export function parseTermInput(body: unknown, creating: boolean): { data: TermInput; error?: never } | { error: string; data?: never } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Dữ liệu không hợp lệ." };
  const b = body as Record<string, unknown>;
  const data: TermInput = {};
  for (const key of ["name", "aliases", "description"] as const) {
    if (!(key in b) && !(creating && key === "name")) continue;
    const value = b[key];
    if (typeof value !== "string" && !(value === null && key !== "name")) return { error: `${LABELS[key]} không hợp lệ.` };
    const trimmed = typeof value === "string" ? value.normalize("NFC").trim().replace(/[ \t]+/g, " ") : "";
    if (key === "name" && !trimmed) return { error: "Vui lòng nhập tên." };
    if (trimmed.length > LIMITS[key]) return { error: `${LABELS[key]} tối đa ${LIMITS[key]} ký tự.` };
    if (key === "name") data.name = trimmed;
    else data[key] = trimmed || null;
  }
  if ("kind" in b) {
    if (typeof b.kind !== "string" || !Object.hasOwn(TERM_KIND_LABEL, b.kind)) return { error: "Loại không hợp lệ." };
    data.kind = b.kind as StoryTermKind;
  }
  if ("pinned" in b) {
    if (typeof b.pinned !== "boolean") return { error: "Trạng thái ghim không hợp lệ." };
    data.pinned = b.pinned;
  }
  if (!creating && !Object.keys(data).length) return { error: "Không có thay đổi hợp lệ." };
  return { data };
}

// ---------------------------------------------------------------------------
// Quick insert ("Nhập nhanh") — characters + terms as one list of chips.
// ---------------------------------------------------------------------------

export type QuickItem = { key: string; text: string; label: string; kind: "character" | StoryTermKind; pinned: boolean };
export type QuickUsage = Record<string, { count: number; last: number }>;

/** Lowercase, no diacritics, đ→d — "Lâu Lâm" and "lau lam" compare equal. */
export function foldVietnamese(s: string) {
  return s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}

function splitAliases(aliases: string | null) {
  return (aliases ?? "").split(/[,;\n]/).map(a => a.normalize("NFC").trim()).filter(Boolean);
}

export function buildQuickItems(
  characters: { id: string; name: string; aliases: string | null; archived_at?: string | null; story_role?: string }[],
  terms: StoryTerm[],
  usage: QuickUsage = {},
): QuickItem[] {
  const items: QuickItem[] = [];
  const seen = new Set<string>();
  const add = (item: QuickItem) => { if (!seen.has(item.text)) { seen.add(item.text); items.push(item); } };
  for (const c of characters) {
    if (c.archived_at) continue;
    add({ key: `c:${c.id}`, text: c.name, label: c.name, kind: "character", pinned: c.story_role === "main" });
    // Quoted aliases ("hắn") are scan rules, not names to type.
    for (const a of splitAliases(c.aliases)) if (!/^["“”«»「」『』]/.test(a)) add({ key: `c:${c.id}:${a}`, text: a, label: a, kind: "character", pinned: false });
  }
  for (const t of terms) {
    add({ key: `t:${t.id}`, text: t.name, label: t.name, kind: t.kind, pinned: t.pinned });
    for (const a of splitAliases(t.aliases)) add({ key: `t:${t.id}:${a}`, text: a, label: a, kind: t.kind, pinned: false });
  }
  const score = (i: QuickItem) => usage[i.key] ?? { count: 0, last: 0 };
  return items.sort((a, b) =>
    Number(b.pinned) - Number(a.pinned) || score(b).last - score(a).last || score(b).count - score(a).count
    || a.text.localeCompare(b.text, "vi"));
}

export type Suggestion = { item: QuickItem; replaceFrom: number };
const MAX_WORDS = 4;
const MIN_PREFIX = 2;

/**
 * Suggestions for the text just before the caret. Names have spaces, so it
 * tries the last 1..4 words ("Lâu L" → "Lâu Lâm"), longest first, matching
 * without case/diacritics. `replaceFrom` is where the typed prefix starts.
 */
export function suggestAt(text: string, caret: number, items: QuickItem[], limit = 5): Suggestion[] {
  const before = text.slice(Math.max(0, caret - 80), caret);
  const offset = caret - before.length;
  // A suggestion only makes sense while the caret ends a word.
  if (!before || /[\s\p{P}]$/u.test(before)) return [];
  const starts: number[] = [];
  const re = /[^\s\p{P}]+/gu;
  for (let m; (m = re.exec(before));) starts.push(m.index);
  const out: Suggestion[] = [];
  const used = new Set<string>();
  for (let n = Math.min(MAX_WORDS, starts.length); n >= 1; n--) {
    const from = starts[starts.length - n];
    const typed = before.slice(from);
    if (typed.length < MIN_PREFIX) continue;
    const folded = foldVietnamese(typed);
    for (const item of items) {
      if (used.has(item.text) || item.text === typed) continue;
      if (item.text.length > typed.length && foldVietnamese(item.text).startsWith(folded)) {
        used.add(item.text);
        out.push({ item, replaceFrom: offset + from });
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

const usageKey = (bookId: string) => `vinh_quick_insert_usage:${bookId}`;
export function readQuickUsage(bookId: string): QuickUsage {
  try { return JSON.parse(localStorage.getItem(usageKey(bookId)) ?? "{}") as QuickUsage; } catch { return {}; }
}
export function bumpQuickUsage(bookId: string, key: string): QuickUsage {
  const usage = readQuickUsage(bookId);
  usage[key] = { count: (usage[key]?.count ?? 0) + 1, last: Date.now() };
  try { localStorage.setItem(usageKey(bookId), JSON.stringify(usage)); } catch { /* ignore */ }
  return usage;
}
