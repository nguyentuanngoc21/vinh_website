import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";

/**
 * POST /api/chapters/:chapterId/vote — toggle bình chọn chương (bấm lại =
 * bỏ vote). Select trước rồi branch insert/delete (không insert-rồi-catch
 * thuần) vì toggle cần BIẾT chiều nào để làm — catch 23505 ở nhánh insert
 * chỉ để chặn race 2 request gần như đồng thời (double-click), không phải
 * cơ chế chính. Dùng service-role + userId resolve qua getAuthedUserId()
 * (giống src/app/api/penalty/route.ts, src/app/api/wallet/balance/route.ts)
 * — KHÔNG dựa vào auth.uid() của RLS trên chapter_votes.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  const { chapterId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Vui lòng đăng nhập để bình chọn." }, { status: 401 });
  }

  const { data: existing } = await supabase
    .from("chapter_votes")
    .select("chapter_id")
    .eq("chapter_id", chapterId)
    .eq("user_id", userId)
    .maybeSingle();

  let voted: boolean;
  if (existing) {
    const { error } = await supabase
      .from("chapter_votes")
      .delete()
      .eq("chapter_id", chapterId)
      .eq("user_id", userId);
    if (error) {
      console.error("[vote] delete failed:", error);
      return NextResponse.json({ error: "Không thể bỏ bình chọn. Vui lòng thử lại." }, { status: 500 });
    }
    voted = false;
  } else {
    const { error } = await supabase.from("chapter_votes").insert({ chapter_id: chapterId, user_id: userId });
    if (error && error.code !== "23505") {
      console.error("[vote] insert failed:", error);
      return NextResponse.json({ error: "Không thể bình chọn. Vui lòng thử lại." }, { status: 500 });
    }
    // 23505 = đã vote từ 1 request trước gần như đồng thời — vẫn coi là thành công.
    voted = true;
  }

  const { data: countRow } = await supabase
    .from("chapter_vote_counts")
    .select("vote_count")
    .eq("chapter_id", chapterId)
    .maybeSingle();

  return NextResponse.json({ voted, voteCount: countRow?.vote_count ?? 0 });
}
