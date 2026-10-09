import { NextResponse } from "next/server";
import { getUserContext, requestError } from "@/lib/mobile/request-context";
import { parseTermInput, TERM_FIELDS } from "@/lib/story-terms";
import { isUuid } from "@/lib/validation/uuid";

type Context = { params: Promise<{ bookId: string; termId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const { bookId, termId } = await params;
  const parsed = parseTermInput(await request.json().catch(() => null), false);
  if (!isUuid(bookId) || !isUuid(termId) || parsed.error) return NextResponse.json({ error: parsed.error || "Không hợp lệ." }, { status: 400 });
  let auth;
  try { auth = await getUserContext(request); } catch (e) { return requestError(e); }
  if (!auth.userId) return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
  const { data, error } = await auth.supabase.from("story_terms").update(parsed.data!)
    .eq("id", termId).eq("book_id", bookId).select(TERM_FIELDS).maybeSingle();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Tên này đã có trong danh sách." }, { status: 409 });
    console.error("[story-terms] update failed:", error);
    return NextResponse.json({ error: "Không lưu được. Vui lòng thử lại." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Không tìm thấy mục này." }, { status: 404 });
  return NextResponse.json({ term: data });
}

export async function DELETE(request: Request, { params }: Context) {
  const { bookId, termId } = await params;
  if (!isUuid(bookId) || !isUuid(termId)) return NextResponse.json({ error: "Không hợp lệ." }, { status: 400 });
  let auth;
  try { auth = await getUserContext(request); } catch (e) { return requestError(e); }
  if (!auth.userId) return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
  const { data, error } = await auth.supabase.from("story_terms").delete().eq("id", termId).eq("book_id", bookId).select("id");
  if (error) {
    console.error("[story-terms] delete failed:", error);
    return NextResponse.json({ error: "Không xoá được. Vui lòng thử lại." }, { status: 500 });
  }
  if (!data?.length) return NextResponse.json({ error: "Không tìm thấy mục này." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
