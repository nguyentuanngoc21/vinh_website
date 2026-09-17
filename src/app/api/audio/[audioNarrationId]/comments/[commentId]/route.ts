import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";

/** DELETE /api/audio/:audioNarrationId/comments/:commentId — chỉ chủ bình
 * luận tự xoá được. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ audioNarrationId: string; commentId: string }> }
) {
  const { audioNarrationId, commentId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
  }

  const { error } = await supabase
    .from("audio_comments")
    .delete()
    .eq("id", commentId)
    .eq("audio_narration_id", audioNarrationId)
    .eq("user_id", userId);
  if (error) {
    console.error("[audio-comments] delete failed:", error);
    return NextResponse.json({ error: "Không thể xoá bình luận." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
