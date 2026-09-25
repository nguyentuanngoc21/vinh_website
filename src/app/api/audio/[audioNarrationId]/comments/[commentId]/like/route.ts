import { NextResponse } from "next/server";
import { getRequestContext, requestError } from "@/lib/mobile/request-context";

/**
 * POST /api/audio/:audioNarrationId/comments/:commentId/like — toggle
 * thích 1 bình luận. KHÔNG tính vào nhiệm vụ nào (narrator_interact_listeners
 * chỉ tính reply, khác designer_interact_readers — xem ghi chú trong
 * migrations/20260917_add_design_audio_comments.sql) — nút vẫn hiện để
 * đối xứng UI với thiết kế, chỉ không có side-effect quest.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ audioNarrationId: string; commentId: string }> }
) {
  const { audioNarrationId, commentId } = await params;
  let auth;
  try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
  const { client: supabase, userId } = auth;
  if (!userId) {
    return NextResponse.json({ error: "Vui lòng đăng nhập để thích." }, { status: 401 });
  }

  const { data: comment } = await supabase
    .from("audio_comments")
    .select("id, audio_narration_id")
    .eq("id", commentId)
    .maybeSingle();
  if (!comment || comment.audio_narration_id !== audioNarrationId) {
    return NextResponse.json({ error: "Không tìm thấy bình luận." }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from("audio_comment_likes")
    .select("comment_id")
    .eq("comment_id", commentId)
    .eq("user_id", userId)
    .maybeSingle();

  let liked: boolean;
  if (existing) {
    const { error } = await supabase
      .from("audio_comment_likes")
      .delete()
      .eq("comment_id", commentId)
      .eq("user_id", userId);
    if (error) {
      console.error("[audio-comment-like] delete failed:", error);
      return NextResponse.json({ error: "Không thể bỏ thích. Vui lòng thử lại." }, { status: 500 });
    }
    liked = false;
  } else {
    const { error } = await supabase.from("audio_comment_likes").insert({ comment_id: commentId, user_id: userId });
    if (error && error.code !== "23505") {
      console.error("[audio-comment-like] insert failed:", error);
      return NextResponse.json({ error: "Không thể thích. Vui lòng thử lại." }, { status: 500 });
    }
    liked = true;
  }

  const { data: countRow } = await supabase
    .from("audio_comment_like_counts")
    .select("like_count")
    .eq("comment_id", commentId)
    .maybeSingle();

  return NextResponse.json({ liked, likeCount: countRow?.like_count ?? 0 });
}
