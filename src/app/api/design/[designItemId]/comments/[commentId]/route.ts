import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";

/** DELETE /api/design/:designItemId/comments/:commentId — chỉ chủ bình
 * luận tự xoá được (RLS "users delete their own design comments" cũng
 * chặn, kiểm thêm ở đây để trả lỗi tiếng Việt gọn). */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ designItemId: string; commentId: string }> }
) {
  const { designItemId, commentId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
  }

  const { error } = await supabase
    .from("design_comments")
    .delete()
    .eq("id", commentId)
    .eq("design_item_id", designItemId)
    .eq("user_id", userId);
  if (error) {
    console.error("[design-comments] delete failed:", error);
    return NextResponse.json({ error: "Không thể xoá bình luận." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
