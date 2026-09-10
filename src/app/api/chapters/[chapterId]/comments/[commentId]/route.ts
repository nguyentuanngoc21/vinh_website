import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";

/**
 * DELETE /api/chapters/:chapterId/comments/:commentId — chỉ chủ bình
 * luận hoặc admin/super_admin mới xoá được. Dùng service-role (bỏ qua
 * RLS) nên phải tự kiểm quyền ở đây — RLS "users delete their own
 * anchored comments"/"admins moderate anchored comments" (schema.sql
 * phần 10f) chỉ là lớp phòng thủ thứ 2, không phải chốt chặn thật cho
 * route này. Xoá 1 bình luận gốc tự xoá hết reply của nó (FK on delete
 * cascade — xem migrations/20260910_add_anchored_comment_replies.sql),
 * không cần dọn thêm ở đây.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ chapterId: string; commentId: string }> }
) {
  const { chapterId, commentId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
  }

  const { data: comment, error: fetchError } = await supabase
    .from("anchored_comments")
    .select("id, user_id, chapter_id")
    .eq("id", commentId)
    .maybeSingle();
  if (fetchError || !comment || comment.chapter_id !== chapterId) {
    return NextResponse.json({ error: "Không tìm thấy bình luận." }, { status: 404 });
  }

  if (comment.user_id !== userId) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
    const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";
    if (!isAdmin) {
      return NextResponse.json({ error: "Bạn không có quyền xoá bình luận này." }, { status: 403 });
    }
  }

  const { error: deleteError } = await supabase.from("anchored_comments").delete().eq("id", commentId);
  if (deleteError) {
    console.error("[chapter-comments] delete failed:", deleteError);
    return NextResponse.json({ error: "Xoá bình luận thất bại." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
