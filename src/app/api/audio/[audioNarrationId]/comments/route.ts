import { NextResponse } from "next/server";
import { getRequestContext, requestError } from "@/lib/mobile/request-context";
import { RewardEngine } from "@/lib/quests/reward-engine";

const BODY_MAX = 2000;

/**
 * GET /api/audio/:audioNarrationId/comments — toàn bộ bình luận của 1 bản
 * thu audio. Đọc công khai, cần biết viewer hiện tại để gắn `isOwn`. Cùng
 * cấu trúc src/app/api/design/[designItemId]/comments/route.ts.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ audioNarrationId: string }> }
) {
  const { audioNarrationId } = await params;
  let auth;
  try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
  const { client: supabase, userId: viewerId } = auth;

  const { data: rows, error } = await supabase
    .from("audio_comments")
    .select("id, user_id, content, parent_comment_id, created_at")
    .eq("audio_narration_id", audioNarrationId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[audio-comments] list failed:", error);
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
      ? supabase.from("audio_comment_like_counts").select("comment_id, like_count").in("comment_id", commentIds)
      : Promise.resolve({ data: [] as { comment_id: string; like_count: number }[] }),
    viewerId && commentIds.length
      ? supabase.from("audio_comment_likes").select("comment_id").eq("user_id", viewerId).in("comment_id", commentIds)
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
 * POST /api/audio/:audioNarrationId/comments — tạo 1 bình luận gốc, hoặc
 * 1 reply (kèm parentCommentId). Reply lồng CHỈ 1 CẤP, enforce ở đây.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ audioNarrationId: string }> }
) {
  const { audioNarrationId } = await params;
  let auth;
  try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
  const { client: supabase, userId } = auth;
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
      .from("audio_comments")
      .select("id, audio_narration_id, parent_comment_id, user_id")
      .eq("id", parentCommentId)
      .maybeSingle();
    if (parentError || !parent || parent.audio_narration_id !== audioNarrationId) {
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
    .from("audio_comments")
    .insert({ user_id: userId, audio_narration_id: audioNarrationId, content, parent_comment_id: parentCommentId })
    .select("id, created_at")
    .single();
  if (error || !comment) {
    console.error("[audio-comments] insert failed:", error);
    return NextResponse.json({ error: "Gửi bình luận thất bại." }, { status: 500 });
  }

  // Nhiệm vụ narrator_interact_listeners — CHỈ tính reply (không có "thả
  // tim" như designer_interact_readers), CHỈ khi CHỦ bản thu reply bình
  // luận của NGƯỜI KHÁC.
  if (parentCommentId && parentAuthorId && parentAuthorId !== userId) {
    const { data: audio } = await supabase
      .from("audio_narrations")
      .select("narrator_id")
      .eq("id", audioNarrationId)
      .maybeSingle();
    if (audio?.narrator_id === userId) {
      const result = await RewardEngine.incrementTaskProgress(supabase, {
        userId,
        taskCode: "narrator_interact_listeners",
      });
      if (!result.ok) console.error("[audio-comments] incrementTaskProgress failed:", result.error);
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
