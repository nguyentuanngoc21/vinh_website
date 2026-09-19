import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { RewardEngine } from "@/lib/quests/reward-engine";

/**
 * POST /api/design/:designItemId/comments/:commentId/like — toggle thích
 * 1 bình luận (bấm lại = bỏ thích). Cùng pattern
 * /api/design/[designItemId]/like: select trước rồi branch insert/delete.
 *
 * Nhiệm vụ designer_interact_readers — "thả tim" cũng tính (khác
 * narrator_interact_listeners, chỉ tính reply) — CHỈ khi CHỦ tác phẩm
 * thích bình luận của NGƯỜI KHÁC, và chỉ ở chiều TẠO mới lượt thích
 * (không tính khi bỏ thích).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ designItemId: string; commentId: string }> }
) {
  const { designItemId, commentId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Vui lòng đăng nhập để thích." }, { status: 401 });
  }

  const { data: comment } = await supabase
    .from("design_comments")
    .select("id, user_id, design_item_id")
    .eq("id", commentId)
    .maybeSingle();
  if (!comment || comment.design_item_id !== designItemId) {
    return NextResponse.json({ error: "Không tìm thấy bình luận." }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from("design_comment_likes")
    .select("comment_id")
    .eq("comment_id", commentId)
    .eq("user_id", userId)
    .maybeSingle();

  let liked: boolean;
  if (existing) {
    const { error } = await supabase
      .from("design_comment_likes")
      .delete()
      .eq("comment_id", commentId)
      .eq("user_id", userId);
    if (error) {
      console.error("[design-comment-like] delete failed:", error);
      return NextResponse.json({ error: "Không thể bỏ thích. Vui lòng thử lại." }, { status: 500 });
    }
    liked = false;
  } else {
    const { error } = await supabase.from("design_comment_likes").insert({ comment_id: commentId, user_id: userId });
    if (error && error.code !== "23505") {
      console.error("[design-comment-like] insert failed:", error);
      return NextResponse.json({ error: "Không thể thích. Vui lòng thử lại." }, { status: 500 });
    }
    liked = true;

    if (!error && comment.user_id !== userId) {
      const { data: item } = await supabase.from("design_items").select("illustrator_id").eq("id", designItemId).maybeSingle();
      if (item?.illustrator_id === userId) {
        const result = await RewardEngine.incrementTaskProgress(supabase, {
          userId,
          taskCode: "designer_interact_readers",
        });
        if (!result.ok) console.error("[design-comment-like] incrementTaskProgress failed:", result.error);
      }
    }
  }

  const { data: countRow } = await supabase
    .from("design_comment_like_counts")
    .select("like_count")
    .eq("comment_id", commentId)
    .maybeSingle();

  return NextResponse.json({ liked, likeCount: countRow?.like_count ?? 0 });
}
