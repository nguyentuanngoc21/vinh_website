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
  const links = await auth.supabase.from("chapter_characters").select("chapter_id").eq("character_id", characterId);
  if (links.error) return NextResponse.json({ error: "Không tải được chương." }, { status: 500 });
  const ids = (links.data ?? []).map(c => c.chapter_id);
  if (!ids.length) return NextResponse.json({ chapters: [] });
  const chapters = await auth.supabase.from("chapters").select("id, title, order_index, published").eq("book_id", bookId).in("id", ids).order("order_index");
  if (chapters.error) return NextResponse.json({ error: "Không tải được chương." }, { status: 500 });
  return NextResponse.json({ chapters: chapters.data }, { headers: { "Cache-Control": "private, no-store" } });
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
