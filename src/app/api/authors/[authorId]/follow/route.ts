import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";

/**
 * POST /api/authors/:authorId/follow — toggle theo dõi tác giả (bấm lại =
 * bỏ theo dõi). Cùng pattern select-rồi-branch với route vote chương. UI
 * đã ẩn nút Theo dõi trên sách của chính tác giả, nhưng vẫn tự chặn
 * userId === authorId ở đây (defense-in-depth, phòng gọi thẳng API) —
 * CHECK follower_id <> author_id ở DB (migrations/20260824_add_author_follows.sql)
 * là chốt chặn cuối cùng nếu cả 2 lớp trên đều bị vượt qua.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ authorId: string }> }
) {
  const { authorId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Vui lòng đăng nhập để theo dõi." }, { status: 401 });
  }
  if (userId === authorId) {
    return NextResponse.json({ error: "Không thể tự theo dõi chính mình." }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("author_follows")
    .select("author_id")
    .eq("follower_id", userId)
    .eq("author_id", authorId)
    .maybeSingle();

  let following: boolean;
  if (existing) {
    const { error } = await supabase
      .from("author_follows")
      .delete()
      .eq("follower_id", userId)
      .eq("author_id", authorId);
    if (error) {
      console.error("[follow] delete failed:", error);
      return NextResponse.json({ error: "Không thể bỏ theo dõi. Vui lòng thử lại." }, { status: 500 });
    }
    following = false;
  } else {
    const { error } = await supabase
      .from("author_follows")
      .insert({ follower_id: userId, author_id: authorId });
    if (error && error.code !== "23505") {
      console.error("[follow] insert failed:", error);
      return NextResponse.json({ error: "Không thể theo dõi. Vui lòng thử lại." }, { status: 500 });
    }
    following = true;
  }

  return NextResponse.json({ following });
}
