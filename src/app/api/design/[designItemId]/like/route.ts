import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";

/**
 * POST /api/design/:designItemId/like — toggle thích (bấm lại = bỏ
 * thích). Cùng pattern với /api/chapters/[chapterId]/vote: select trước
 * rồi branch insert/delete (toggle cần BIẾT chiều nào để làm), dùng
 * service-role + userId resolve qua getAuthedUserId() (KHÔNG dựa vào
 * auth.uid() của RLS trên design_item_likes).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ designItemId: string }> }
) {
  const { designItemId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Vui lòng đăng nhập để thích." }, { status: 401 });
  }

  const { data: existing } = await supabase
    .from("design_item_likes")
    .select("design_item_id")
    .eq("design_item_id", designItemId)
    .eq("user_id", userId)
    .maybeSingle();

  let liked: boolean;
  if (existing) {
    const { error } = await supabase
      .from("design_item_likes")
      .delete()
      .eq("design_item_id", designItemId)
      .eq("user_id", userId);
    if (error) {
      console.error("[design/like] delete failed:", error);
      return NextResponse.json({ error: "Không thể bỏ thích. Vui lòng thử lại." }, { status: 500 });
    }
    liked = false;
  } else {
    const { error } = await supabase
      .from("design_item_likes")
      .insert({ design_item_id: designItemId, user_id: userId });
    if (error && error.code !== "23505") {
      console.error("[design/like] insert failed:", error);
      return NextResponse.json({ error: "Không thể thích. Vui lòng thử lại." }, { status: 500 });
    }
    // 23505 = đã thích từ 1 request trước gần như đồng thời — vẫn coi là thành công.
    liked = true;
  }

  const { data: countRow } = await supabase
    .from("design_item_like_counts")
    .select("like_count")
    .eq("design_item_id", designItemId)
    .maybeSingle();

  return NextResponse.json({ liked, likeCount: countRow?.like_count ?? 0 });
}
