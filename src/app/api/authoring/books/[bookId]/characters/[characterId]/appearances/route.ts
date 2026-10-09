import { NextResponse } from "next/server";
import { getUserContext, requestError } from "@/lib/mobile/request-context";
import { isUuid } from "@/lib/validation/uuid";

const KEYS = {
  confirmChapterIds: "p_confirm_chapter_ids", dismissChapterIds: "p_dismiss_chapter_ids", resetChapterIds: "p_reset_chapter_ids",
  mainBookIds: "p_main_book_ids", cameoBookIds: "p_cameo_book_ids", dismissBookIds: "p_dismiss_book_ids", resetBookIds: "p_reset_book_ids",
} as const;

/**
 * POST — save the author's review of scan results (or undo one from "Đã bỏ qua").
 * Every list is optional; the RPC applies them in one transaction.
 */
export async function POST(request: Request, { params }: { params: Promise<{ bookId: string; characterId: string }> }) {
  const { bookId, characterId } = await params;
  const body = await request.json().catch(() => null);
  if (!isUuid(bookId) || !isUuid(characterId) || !body || typeof body !== "object") {
    return NextResponse.json({ error: "Dữ liệu xác nhận không hợp lệ." }, { status: 400 });
  }
  const args: Record<string, string[]> = {};
  for (const [key, param] of Object.entries(KEYS)) {
    const value = (body as Record<string, unknown>)[key] ?? [];
    if (!Array.isArray(value) || value.length > 5000 || value.some(id => typeof id !== "string" || !isUuid(id))) {
      return NextResponse.json({ error: "Dữ liệu xác nhận không hợp lệ." }, { status: 400 });
    }
    args[param] = [...new Set(value as string[])];
  }
  let auth;
  try { auth = await getUserContext(request); } catch (e) { return requestError(e); }
  if (!auth.userId) return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
  // The RPC re-checks that the character and every chapter/book belong to the caller.
  const { data: owned } = await auth.supabase.from("characters").select("id").eq("id", characterId).eq("book_id", bookId).maybeSingle();
  if (!owned) return NextResponse.json({ error: "Không tìm thấy nhân vật." }, { status: 404 });
  const { error } = await auth.supabase.rpc("review_character_appearances", { p_character_id: characterId, ...args });
  if (error) {
    if (error.code === "42501") return NextResponse.json({ error: "Nhân vật đã lưu trữ hoặc bạn không có quyền." }, { status: 403 });
    if (["22023", "23514"].includes(error.code)) return NextResponse.json({ error: "Có chương hoặc truyện không hợp lệ, hoặc bị chọn hai lần. Vui lòng quét lại." }, { status: 400 });
    console.error("[characters/appearances] review failed:", error);
    return NextResponse.json({ error: "Không lưu được xác nhận. Dữ liệu cũ vẫn được giữ nguyên." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
