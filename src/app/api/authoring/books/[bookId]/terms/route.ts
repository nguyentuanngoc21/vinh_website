import { NextResponse } from "next/server";
import { getUserContext, requestError } from "@/lib/mobile/request-context";
import { parseTermInput, TERM_FIELDS } from "@/lib/story-terms";
import { isUuid } from "@/lib/validation/uuid";

type Context = { params: Promise<{ bookId: string }> };

/** Địa danh / vật phẩm / … của truyện — chỉ tác giả (RLS "authors manage terms in their own books"). */
export async function GET(request: Request, { params }: Context) {
  const { bookId } = await params;
  if (!isUuid(bookId)) return NextResponse.json({ error: "Truyện không hợp lệ." }, { status: 400 });
  let auth;
  try { auth = await getUserContext(request); } catch (e) { return requestError(e); }
  if (!auth.userId) return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
  const { data, error } = await auth.supabase.from("story_terms").select(TERM_FIELDS).eq("book_id", bookId).order("created_at");
  if (error) return NextResponse.json({ error: "Không tải được danh sách." }, { status: 500 });
  return NextResponse.json({ terms: data }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request, { params }: Context) {
  const { bookId } = await params;
  const parsed = parseTermInput(await request.json().catch(() => null), true);
  if (!isUuid(bookId) || parsed.error) return NextResponse.json({ error: parsed.error || "Truyện không hợp lệ." }, { status: 400 });
  let auth;
  try { auth = await getUserContext(request); } catch (e) { return requestError(e); }
  if (!auth.userId) return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
  const { data, error } = await auth.supabase.from("story_terms")
    .insert({ ...parsed.data, book_id: bookId, name: parsed.data!.name! }).select(TERM_FIELDS).single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Tên này đã có trong danh sách." }, { status: 409 });
    if (error.code === "42501") return NextResponse.json({ error: "Bạn không có quyền với truyện này." }, { status: 403 });
    console.error("[story-terms] insert failed:", error);
    return NextResponse.json({ error: "Không thêm được. Vui lòng thử lại." }, { status: 500 });
  }
  return NextResponse.json({ term: data }, { status: 201 });
}
