import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { RewardEngine } from "@/lib/quests/reward-engine";

const BODY_MAX = 2000;

/**
 * GET /api/design/:designItemId/comments — toàn bộ bình luận của 1 tác
 * phẩm thiết kế (không phân trang — số lượng nhỏ, cùng cách chapter
 * comments làm). Đọc công khai, cần biết viewer hiện tại để gắn `isOwn`.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ designItemId: string }> }
) {
  const { designItemId } = await params;
  const supabase = createServiceRoleClient();
  const viewerId = await getAuthedUserId(supabase);

  const { data: rows, error } = await supabase
    .from("design_comments")
    .select("id, user_id, content, parent_comment_id, created_at")
    .eq("design_item_id", designItemId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[design-comments] list failed:", error);
    return NextResponse.json({ error: "Không tải được bình luận." }, { status: 500 });
  }

  const commentIds = (rows ?? []).map((r) => r.id);
  const [profilesRes, likeCountsRes, myLikesRes] = await Promise.all([
    (async () => {
      const authorIds = [...new Set((rows ?? []).map((r) => r.user_id))];
      return authorIds.length
        ? supabase.from("author_public_profiles").select("id, nickname, avatar_url").in("id", authorIds)
        : { data: [] as { id: string; nickname: string; avatar_url: string | null }[] };
    })(),
    commentIds.length
      ? supabase.from("design_comment_like_counts").select("comment_id, like_count").in("comment_id", commentIds)
      : Promise.resolve({ data: [] as { comment_id: string; like_count: number }[] }),
    viewerId && commentIds.length
      ? supabase.from("design_comment_likes").select("comment_id").eq("user_id", viewerId).in("comment_id", commentIds)
      : Promise.resolve({ data: [] as { comment_id: string }[] }),
  ]);

  const profileById = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
  const likeCountByCommentId = new Map((likeCountsRes.data ?? []).map((r) => [r.comment_id, r.like_count]));
  const likedCommentIds = new Set((myLikesRes.data ?? []).map((r) => r.comment_id));

  const comments = (rows ?? []).map((r) => {
    const profile = profileById.get(r.user_id);
    return {
      id: r.id,
      content: r.content,
      parentCommentId: r.parent_comment_id,
      createdAt: r.created_at,
      authorId: r.user_id,
      authorName: profile?.nickname ?? "Người dùng ẩn danh",
      authorAvatarUrl: profile?.avatar_url ?? null,
      isOwn: viewerId !== null && r.user_id === viewerId,
      likeCount: likeCountByCommentId.get(r.id) ?? 0,
      liked: likedCommentIds.has(r.id),
    };
  });

  return NextResponse.json({ comments });
}

/**
 * POST /api/design/:designItemId/comments — tạo 1 bình luận gốc, hoặc 1
 * reply (kèm parentCommentId). Reply lồng CHỈ 1 CẤP, enforce ở đây (không
 * phải CHECK DB) — cùng quy ước với chapter comments.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ designItemId: string }> }
) {
  const { designItemId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Vui lòng đăng nhập để bình luận." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "Bình luận không được để trống." }, { status: 400 });
  }
  if (content.length > BODY_MAX) {
    return NextResponse.json({ error: `Bình luận tối đa ${BODY_MAX} ký tự.` }, { status: 400 });
  }

  const parentCommentId = typeof body?.parentCommentId === "string" ? body.parentCommentId : null;
  let parentAuthorId: string | null = null;

  if (parentCommentId) {
    const { data: parent, error: parentError } = await supabase
      .from("design_comments")
      .select("id, design_item_id, parent_comment_id, user_id")
      .eq("id", parentCommentId)
      .maybeSingle();
    if (parentError || !parent || parent.design_item_id !== designItemId) {
      return NextResponse.json({ error: "Không tìm thấy bình luận gốc." }, { status: 404 });
    }
    if (parent.parent_comment_id !== null) {
      return NextResponse.json(
        { error: "Chỉ trả lời được bình luận gốc, không trả lời được 1 reply." },
        { status: 400 }
      );
    }
    parentAuthorId = parent.user_id;
  }

  const { data: comment, error } = await supabase
    .from("design_comments")
    .insert({ user_id: userId, design_item_id: designItemId, content, parent_comment_id: parentCommentId })
    .select("id, created_at")
    .single();
  if (error || !comment) {
    console.error("[design-comments] insert failed:", error);
    return NextResponse.json({ error: "Gửi bình luận thất bại." }, { status: 500 });
  }

  // Nhiệm vụ designer_interact_readers — CHỈ tính khi CHỦ tác phẩm reply
  // bình luận của NGƯỜI KHÁC (không tự trả lời chính mình).
  if (parentCommentId && parentAuthorId && parentAuthorId !== userId) {
    const { data: item } = await supabase.from("design_items").select("illustrator_id").eq("id", designItemId).maybeSingle();
    if (item?.illustrator_id === userId) {
      const result = await RewardEngine.incrementTaskProgress(supabase, {
        userId,
        taskCode: "designer_interact_readers",
      });
      if (!result.ok) console.error("[design-comments] incrementTaskProgress failed:", result.error);
    }
  }

  return NextResponse.json({
    comment: {
      id: comment.id,
      content,
      parentCommentId,
      createdAt: comment.created_at,
      authorId: userId,
      isOwn: true,
      likeCount: 0,
      liked: false,
    },
  });
}
