import type { SupabaseClient } from "@supabase/supabase-js";
import type { CharacterBookAppearance, Database } from "@/lib/supabase/types";
import { createMentionMatcher, parseMentionTerms } from "@/lib/character-mentions";

type Db = SupabaseClient<Database>;
const PAGE = 1000;
const CONTENT_BATCH = 40;

export type ScanHit = { id: string; title: string; order_index: number; published: boolean; count: number; snippet: string };
export type ScanBook = { id: string; title: string; appearance: CharacterBookAppearance | null; chapters: ScanHit[] };
export type ScanResult = {
  ownBook: ScanBook;
  otherBooks: ScanBook[];
  scannedChapters: number;
  skipped: { dismissedChapters: number; decidedBooks: number };
};
export type ScanError = { status: number; error: string };

/** PostgREST caps a response at 1000 rows; page through bigger lists. */
async function fetchAll<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

/**
 * Scans the author's books for one character. Metadata goes through the
 * caller's RLS client (`db`), so ownership is enforced by the author policies;
 * only chapter `content` — revoked from authenticated — is read with the
 * service-role client, and only for chapter ids that `db` already returned.
 * Skips chapters already tagged or reviewed and books already marked cameo
 * or dismissed, so a decision is never asked twice.
 */
export async function scanCharacterMentions(db: Db, admin: Db, userId: string, bookId: string, characterId: string): Promise<ScanResult | ScanError> {
  const { data: character, error: charError } = await db.from("characters")
    .select("id, name, aliases, archived_at").eq("id", characterId).eq("book_id", bookId).maybeSingle();
  if (charError) throw charError;
  if (!character) return { status: 404, error: "Không tìm thấy nhân vật." };
  if (character.archived_at) return { status: 400, error: "Khôi phục nhân vật trước khi nhận diện." };

  const { data: books, error: booksError } = await db.from("books").select("id, title")
    .eq("author_id", userId).is("deleted_at", null);
  if (booksError) throw booksError;
  const ownBook = books?.find(b => b.id === bookId);
  if (!ownBook) return { status: 403, error: "Bạn không có quyền với truyện này." };
  const bookIds = books!.map(b => b.id);

  const [others, tagged, reviews, links] = await Promise.all([
    fetchAll((a, z) => db.from("characters").select("id, name, aliases").in("book_id", bookIds).is("archived_at", null).neq("id", characterId).range(a, z)),
    fetchAll((a, z) => db.from("chapter_characters").select("chapter_id").eq("character_id", characterId).range(a, z)),
    fetchAll((a, z) => db.from("character_chapter_reviews").select("chapter_id, decision").eq("character_id", characterId).range(a, z)),
    fetchAll((a, z) => db.from("character_book_links").select("book_id, appearance").eq("character_id", characterId).range(a, z)),
  ]);
  const appearanceByBook = new Map(links.map(l => [l.book_id, l.appearance]));
  const scanBookIds = bookIds.filter(id => id === bookId || appearanceByBook.get(id) === undefined || appearanceByBook.get(id) === "main");
  const skip = new Set([...tagged.map(t => t.chapter_id), ...reviews.map(r => r.chapter_id)]);

  const chapters = scanBookIds.length ? await fetchAll((a, z) => db.from("chapters")
    .select("id, book_id, title, order_index, published").in("book_id", scanBookIds).is("removed_at", null)
    .order("book_id").order("order_index").range(a, z)) : [];
  const toScan = chapters.filter(c => !skip.has(c.id));
  const byId = new Map(toScan.map(c => [c.id, c]));

  const matcher = createMentionMatcher(parseMentionTerms(character.name, character.aliases),
    others.flatMap(o => parseMentionTerms(o.name, o.aliases)));
  const hitsByBook = new Map<string, ScanHit[]>();
  for (let i = 0; i < toScan.length; i += CONTENT_BATCH) {
    const ids = toScan.slice(i, i + CONTENT_BATCH).map(c => c.id);
    const { data, error } = await admin.from("chapters").select("id, content").in("id", ids);
    if (error) throw error;
    for (const row of data ?? []) {
      const meta = byId.get(row.id);
      const found = meta && matcher(row.content ?? "");
      if (!meta || !found) continue;
      const list = hitsByBook.get(meta.book_id) ?? [];
      list.push({ id: meta.id, title: meta.title, order_index: meta.order_index, published: meta.published, count: found.count, snippet: found.snippet });
      hitsByBook.set(meta.book_id, list);
    }
  }
  const sorted = (id: string) => (hitsByBook.get(id) ?? []).sort((a, b) => a.order_index - b.order_index);

  return {
    ownBook: { id: ownBook.id, title: ownBook.title, appearance: null, chapters: sorted(ownBook.id) },
    otherBooks: books!.filter(b => b.id !== bookId && hitsByBook.has(b.id))
      .map(b => ({ id: b.id, title: b.title, appearance: appearanceByBook.get(b.id) ?? null, chapters: sorted(b.id) })),
    scannedChapters: toScan.length,
    skipped: {
      dismissedChapters: reviews.filter(r => r.decision === "dismissed").length,
      decidedBooks: links.filter(l => l.appearance !== "main").length,
    },
  };
}
