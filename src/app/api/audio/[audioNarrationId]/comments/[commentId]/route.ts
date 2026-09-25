import { NextResponse } from "next/server";
import { getRequestContext, requestError } from "@/lib/mobile/request-context";

/** DELETE /api/audio/:audioNarrationId/comments/:commentId — chỉ chủ bình
 * luận tự xoá được. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ audioNarrationId: string; commentId: string }> }
) {
  const { audioNarrationId, commentId } = await params;
  let auth;
  try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
  const { client: supabase, userId } = auth;
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
