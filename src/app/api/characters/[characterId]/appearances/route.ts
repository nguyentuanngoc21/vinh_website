import { NextResponse } from "next/server";
import { getRequestContext, requestError } from "@/lib/mobile/request-context";
import { isUuid } from "@/lib/validation/uuid";

export type PublicAppearanceBook = {
  id: string; title: string; appearance: "own" | "main" | "cameo";
  chapters: { id: string; title: string; order_index: number }[];
};

/**
 * GET — the reader-facing hover list: chapters (own book + "main" books) and
 * cameo book titles. public_character_appearances only returns public
 * characters and published, unremoved chapters of published books.
 */
export async function GET(request: Request, { params }: { params: Promise<{ characterId: string }> }) {
  const { characterId } = await params;
  if (!isUuid(characterId)) return NextResponse.json({ error: "Nhân vật không hợp lệ." }, { status: 400 });
  let ctx;
  try { ctx = await getRequestContext(request); } catch (e) { return requestError(e); }
  const { data, error } = await ctx.client.rpc("public_character_appearances", { p_character_id: characterId });
  if (error) {
    console.error("[characters/appearances] read failed:", error);
    return NextResponse.json({ error: "Không tải được danh sách chương." }, { status: 500 });
  }
  const books = new Map<string, PublicAppearanceBook>();
  for (const row of data ?? []) {
    const book = books.get(row.book_id) ?? { id: row.book_id, title: row.book_title, appearance: row.appearance, chapters: [] };
    if (row.chapter_id) book.chapters.push({ id: row.chapter_id, title: row.chapter_title ?? "", order_index: row.order_index ?? 0 });
    books.set(row.book_id, book);
  }
  const rank = { own: 0, main: 1, cameo: 2 };
  const list = [...books.values()].sort((a, b) => rank[a.appearance] - rank[b.appearance] || a.title.localeCompare(b.title, "vi"));
  for (const b of list) b.chapters.sort((x, y) => x.order_index - y.order_index);
  return NextResponse.json({ books: list }, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
}
