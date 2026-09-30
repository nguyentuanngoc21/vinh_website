import { parseCharacterIds } from "@/lib/characters";
import { isUuid } from "@/lib/validation/uuid";
import { NextResponse } from "next/server";
import { getUserContext, requestError } from "@/lib/mobile/request-context";

/** Atomic replacement; expectedCharacterIds enables stale-write detection. */
export async function PUT(request: Request, { params }: { params: Promise<{ chapterId: string }> }) {
  const { chapterId } = await params;
  const body = await request.json().catch(() => null);
  const ids = parseCharacterIds(body?.characterIds);
  const expected = body?.expectedCharacterIds === undefined ? undefined : parseCharacterIds(body.expectedCharacterIds);
  if (!isUuid(chapterId) || !ids || expected === null) {
    return NextResponse.json({ error: "Danh sách nhân vật không hợp lệ." }, { status: 400 });
  }
  let auth;
  try { auth = await getUserContext(request); } catch (e) { return requestError(e); }
  if (!auth.userId) return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
  const { data, error } = await auth.supabase.rpc("set_chapter_characters", {
    p_chapter_id: chapterId, p_character_ids: ids,
    ...(expected === undefined ? {} : { p_expected_character_ids: expected }),
  });
  if (error) {
    if (error.code === "40001") {
      const { data: current, error: readError } = await auth.supabase.from("chapter_characters").select("character_id").eq("chapter_id", chapterId);
      return NextResponse.json({ error: "Danh sách đã thay đổi ở nơi khác. Vui lòng kiểm tra danh sách mới và chọn lại thay đổi của bạn.",
        ...(readError ? {} : { characterIds: (current ?? []).map(c => c.character_id) }) }, { status: 409 });
    }
    if (error.code === "42501") return NextResponse.json({ error: "Bạn không có quyền sửa chương này." }, { status: 403 });
    if (["22023", "23514"].includes(error.code)) return NextResponse.json({ error: "Nhân vật không thuộc truyện, đã lưu trữ hoặc không còn tồn tại." }, { status: 400 });
    console.error("[chapter-characters] transaction failed:", error);
    return NextResponse.json({ error: "Không lưu được danh sách. Dữ liệu cũ vẫn được giữ nguyên." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, characterIds: data });
}
