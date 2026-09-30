import { NextResponse } from "next/server";
import { getUserContext, requestError } from "@/lib/mobile/request-context";
import { CHARACTER_FIELDS, parseCharacterInput } from "@/lib/characters";
import { isUuid } from "@/lib/validation/uuid";

export async function POST(request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const parsed = parseCharacterInput(await request.json().catch(() => null), true);
  if (!isUuid(bookId) || parsed.error) return NextResponse.json({ error: parsed.error || "Truyện không hợp lệ." }, { status: 400 });
  let auth;
  try { auth = await getUserContext(request); } catch (e) { return requestError(e); }
  if (!auth.userId) return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
  const { data, error } = await auth.supabase.from("characters")
    .insert({ ...parsed.data, book_id: bookId, name: parsed.data!.name! }).select(CHARACTER_FIELDS).single();
  if (error) {
    console.error("[characters] insert failed:", error);
    return NextResponse.json({ error: "Không tạo được nhân vật. Kiểm tra quyền tác giả và thử lại." }, { status: error.code === "42501" ? 403 : 500 });
  }
  return NextResponse.json({ character: data }, { status: 201 });
}
