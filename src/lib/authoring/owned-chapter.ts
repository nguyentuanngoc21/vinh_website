import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Chapter of a book the caller owns, checked through the caller's own RLS
 * client — call this BEFORE any service-role read of chapter content/history.
 */
export async function loadOwnedChapter(db: SupabaseClient<Database>, userId: string, chapterId: string) {
  const { data: chapter } = await db.from("chapters").select("id, book_id, title").eq("id", chapterId).maybeSingle();
  if (!chapter) return null;
  const { data: book } = await db.from("books").select("author_id, deleted_at").eq("id", chapter.book_id).maybeSingle();
  if (!book || book.author_id !== userId || book.deleted_at) return null;
  return chapter;
}
