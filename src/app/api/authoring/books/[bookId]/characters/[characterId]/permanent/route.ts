import { NextResponse } from "next/server";
import { getUserContext, requestError } from "@/lib/mobile/request-context";
import { isUuid } from "@/lib/validation/uuid";

/**
 * Hard delete for a character created by mistake. The RPC enforces the
 * 15-minute window (DB clock) and refuses once readers have followed/voted;
 * after that, authors archive instead (DELETE on the parent route).
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ bookId: string; characterId: string }> }) {
  const { bookId, characterId } = await params;
  if (!isUuid(bookId) || !isUuid(characterId)) return NextResponse.json({ error: "Nhân vật không hợp lệ." }, { status: 400 });
  let auth;
  try { auth = await getUserContext(request); } catch (e) { return requestError(e); }
  if (!auth.userId) return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
  const { error } = await auth.supabase.rpc("delete_recent_character", { p_book_id: bookId, p_character_id: characterId });
  if (error) {
    if (error.code === "42501") return NextResponse.json({ error: "Không tìm thấy nhân vật hoặc bạn không có quyền xoá." }, { status: 404 });
    if (error.code === "55000") {
      return NextResponse.json({ error: error.hint === "reader_activity"
        ? "Nhân vật đã có độc giả theo dõi hoặc bình chọn nên không thể xoá. Bạn có thể lưu trữ nhân vật."
        : "Chỉ xoá được trong 15 phút sau khi tạo. Bạn có thể lưu trữ nhân vật." }, { status: 409 });
    }
    console.error("[characters] permanent delete failed:", error);
    return NextResponse.json({ error: "Không xoá được nhân vật. Vui lòng thử lại." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
