import { NextResponse } from "next/server";
import { getRequestContext, requestError } from "@/lib/mobile/request-context";

/**
 * POST   /api/chapters/:chapterId/comments/:commentId/pin — ghim 1 bình luận chương.
 * DELETE /api/chapters/:chapterId/comments/:commentId/pin — bỏ ghim.
 *
 * Chỉ TÁC GIẢ của truyện chứa chương. Chỉ ghim được bình luận GỐC cho cả chương
 * (paragraph_index NULL, không phải reply). Mỗi chương tối đa 1 bình luận ghim
 * (unique index anchored_comments_one_pin_per_chapter) — ghim cái mới tự bỏ
 * ghim cái cũ. Xem migrations/20261006_chapter_pinned_comment.sql; cột
 * pinned_at chỉ ghi được qua service-role nên kiểm quyền ở đây là chốt chặn thật.
 */
export async function POST(request: Request, context: { params: Promise<{ chapterId: string; commentId: string }> }) {
  return setPinned(request, context, true);
}

export async function DELETE(request: Request, context: { params: Promise<{ chapterId: string; commentId: string }> }) {
  return setPinned(request, context, false);
}

async function setPinned(
  request: Request,
  { params }: { params: Promise<{ chapterId: string; commentId: string }> },
  pin: boolean
) {
  const { chapterId, commentId } = await params;
  let auth;
  try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
  const { client: supabase, userId } = auth;
  if (!userId) {
    return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
  }

  const { data: chapter } = await supabase.from("chapters").select("book_id").eq("id", chapterId).maybeSingle();
  const { data: book } = chapter
    ? await supabase.from("books").select("author_id").eq("id", chapter.book_id).maybeSingle()
    : { data: null };
  if (!book) {
    return NextResponse.json({ error: "Không tìm thấy chương." }, { status: 404 });
  }
  if (book.author_id !== userId) {
    return NextResponse.json({ error: "Chỉ tác giả mới ghim được bình luận." }, { status: 403 });
  }

  const { data: comment, error: fetchError } = await supabase
    .from("anchored_comments")
    .select("id, chapter_id, paragraph_index, parent_comment_id, quest_id")
    .eq("id", commentId)
    .maybeSingle();
  if (fetchError || !comment || comment.chapter_id !== chapterId || comment.quest_id !== null) {
    return NextResponse.json({ error: "Không tìm thấy bình luận." }, { status: 404 });
  }
  if (comment.paragraph_index !== null || comment.parent_comment_id !== null) {
    return NextResponse.json({ error: "Chỉ ghim được bình luận gốc của chương." }, { status: 400 });
  }

  if (!pin) {
    const { error } = await supabase.from("anchored_comments").update({ pinned_at: null }).eq("id", commentId);
    if (error) {
      console.error("[chapter-comments] unpin failed:", error);
      return NextResponse.json({ error: "Bỏ ghim thất bại." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, pinned: false });
  }

  // Bỏ ghim cũ trước rồi mới ghim mới — unique index chỉ cho 1 hàng pinned/chương.
  const { error: clearError } = await supabase
    .from("anchored_comments")
    .update({ pinned_at: null })
    .eq("chapter_id", chapterId)
    .not("pinned_at", "is", null)
    .neq("id", commentId);
  if (clearError) {
    console.error("[chapter-comments] clear previous pin failed:", clearError);
    return NextResponse.json({ error: "Ghim bình luận thất bại." }, { status: 500 });
  }
  const { error } = await supabase
    .from("anchored_comments")
    .update({ pinned_at: new Date().toISOString() })
    .eq("id", commentId);
  if (error) {
    console.error("[chapter-comments] pin failed:", error);
    return NextResponse.json({ error: "Ghim bình luận thất bại." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, pinned: true });
}
