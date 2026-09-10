import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";

/** DELETE /api/chapters/:chapterId/highlights/:highlightId — chỉ chủ sở
 * hữu xoá được (highlight riêng tư, không có khái niệm admin-moderate
 * như anchored_comments — đây là ghi chú cá nhân, không ai khác thấy). */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ chapterId: string; highlightId: string }> }
) {
  const { chapterId, highlightId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
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
