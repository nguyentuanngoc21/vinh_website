import { NextResponse } from "next/server";
import { getUserContext, requestError } from "@/lib/mobile/request-context";
import { CHARACTER_FIELDS, parseCharacterInput } from "@/lib/characters";
import { isUuid } from "@/lib/validation/uuid";

type Context = { params: Promise<{ bookId: string; characterId: string }> };

export async function GET(request: Request, { params }: Context) {
  const { bookId, characterId } = await params;
  if (!isUuid(bookId) || !isUuid(characterId)) return NextResponse.json({ error: "Nhân vật không hợp lệ." }, { status: 400 });
  let auth;
  try { auth = await getUserContext(request); } catch (e) { return requestError(e); }
  if (!auth.userId) return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
  const { data: character, error } = await auth.supabase.from("characters").select("id").eq("id", characterId).eq("book_id", bookId).maybeSingle();
  if (error) return NextResponse.json({ error: "Không tải được nhân vật." }, { status: 500 });
  if (!character) return NextResponse.json({ error: "Không tìm thấy nhân vật." }, { status: 404 });
  const [links, reviews, bookLinks] = await Promise.all([
    auth.supabase.from("chapter_characters").select("chapter_id").eq("character_id", characterId),
    auth.supabase.from("character_chapter_reviews").select("chapter_id, decision").eq("character_id", characterId),
    auth.supabase.from("character_book_links").select("book_id, appearance").eq("character_id", characterId),
  ]);
  if (links.error || reviews.error || bookLinks.error) return NextResponse.json({ error: "Không tải được chương." }, { status: 500 });
  const ids = [...(links.data ?? []).map(c => c.chapter_id), ...(reviews.data ?? []).map(r => r.chapter_id)];
  const bookIds = (bookLinks.data ?? []).map(l => l.book_id);
  const [chapters, books] = await Promise.all([
    ids.length ? auth.supabase.from("chapters").select("id, book_id, title, order_index, published").in("id", ids).order("order_index")
      : Promise.resolve({ data: [] as { id: string; book_id: string; title: string; order_index: number; published: boolean }[], error: null }),
    bookIds.length ? auth.supabase.from("books").select("id, title").in("id", bookIds).is("deleted_at", null)
      : Promise.resolve({ data: [] as { id: string; title: string }[], error: null }),
  ]);
  if (chapters.error || books.error) return NextResponse.json({ error: "Không tải được chương." }, { status: 500 });
  const decision = new Map((reviews.data ?? []).map(r => [r.chapter_id, r.decision]));
  const bookTitle = new Map((books.data ?? []).map(b => [b.id, b.title]));
  const all = chapters.data ?? [];
  const pick = ({ id, title, order_index, published }: (typeof all)[number]) => ({ id, title, order_index, published });
  // `chapters` keeps its original meaning (own-book tags) for older clients.
  return NextResponse.json({
    chapters: all.filter(c => c.book_id === bookId && !decision.has(c.id)).map(pick),
    otherBooks: (bookLinks.data ?? []).filter(l => l.appearance !== "dismissed" && bookTitle.has(l.book_id)).map(l => ({
      id: l.book_id, title: bookTitle.get(l.book_id)!, appearance: l.appearance,
      chapters: l.appearance === "main" ? all.filter(c => c.book_id === l.book_id && decision.get(c.id) === "confirmed").map(pick) : [],
    })),
    dismissed: {
      chapters: all.filter(c => decision.get(c.id) === "dismissed").map(c => ({ ...pick(c), book_id: c.book_id, book_title: c.book_id === bookId ? null : bookTitle.get(c.book_id) ?? null })),
      books: (bookLinks.data ?? []).filter(l => l.appearance === "dismissed" && bookTitle.has(l.book_id)).map(l => ({ id: l.book_id, title: bookTitle.get(l.book_id)! })),
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request, { params }: Context) {
  const { bookId, characterId } = await params;
  const parsed = parseCharacterInput(await request.json().catch(() => null), false);
  if (!isUuid(bookId) || !isUuid(characterId) || parsed.error) return NextResponse.json({ error: parsed.error || "Nhân vật không hợp lệ." }, { status: 400 });
  let auth;
  try { auth = await getUserContext(request); } catch (e) { return requestError(e); }
  if (!auth.userId) return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
  const { data, error } = await auth.supabase.from("characters").update(parsed.data!)
    .eq("id", characterId).eq("book_id", bookId).select(CHARACTER_FIELDS).maybeSingle();
  if (error) {
    console.error("[characters] update failed:", error);
    return NextResponse.json({ error: "Không lưu được nhân vật. Vui lòng thử lại." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Không tìm thấy nhân vật hoặc bạn không có quyền sửa." }, { status: 404 });
  return NextResponse.json({ character: data });
}

/** Legacy DELETE archives, retaining chapter tags, followers and votes. */
export async function DELETE(request: Request, context: Context) {
  return PATCH(new Request(request.url, { method: "PATCH", headers: request.headers,
    body: JSON.stringify({ archived: true }) }), context);
}
