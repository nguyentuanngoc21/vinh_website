import { NextResponse } from "next/server";
import { getRequestContext, requestError } from "@/lib/mobile/request-context";

/** DELETE /api/chapters/:chapterId/highlights/:highlightId — chỉ chủ sở
 * hữu xoá được (highlight riêng tư, không có khái niệm admin-moderate
 * như anchored_comments — đây là ghi chú cá nhân, không ai khác thấy). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ chapterId: string; highlightId: string }> }
) {
  const { chapterId, highlightId } = await params;
  let auth;
  try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
  const { client: supabase, userId } = auth;
  if (!userId) {
    return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
  }

  const { error } = await supabase
    .from("highlights")
    .delete()
    .eq("id", highlightId)
    .eq("chapter_id", chapterId)
    .eq("user_id", userId);
  if (error) {
    console.error("[highlights] delete failed:", error);
    return NextResponse.json({ error: "Xoá highlight thất bại." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
