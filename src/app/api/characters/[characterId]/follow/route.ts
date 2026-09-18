import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";

/**
 * POST /api/characters/:characterId/follow — toggle theo dõi 1 nhân vật
 * (bấm lại = bỏ theo dõi). Cùng pattern
 * src/app/api/authors/[authorId]/follow/route.ts: select trước rồi
 * branch insert/delete, dùng service-role + userId resolve qua
 * getAuthedUserId().
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ characterId: string }> }
) {
  const { characterId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Vui lòng đăng nhập để theo dõi." }, { status: 401 });
  }

  const { data: existing } = await supabase
    .from("character_follows")
    .select("character_id")
    .eq("follower_id", userId)
    .eq("character_id", characterId)
    .maybeSingle();

  let following: boolean;
  if (existing) {
    const { error } = await supabase
      .from("character_follows")
      .delete()
      .eq("follower_id", userId)
      .eq("character_id", characterId);
    if (error) {
      console.error("[character-follow] delete failed:", error);
      return NextResponse.json({ error: "Không thể bỏ theo dõi. Vui lòng thử lại." }, { status: 500 });
    }
    following = false;
  } else {
    const { error } = await supabase.from("character_follows").insert({ follower_id: userId, character_id: characterId });
    if (error && error.code !== "23505") {
      console.error("[character-follow] insert failed:", error);
      return NextResponse.json({ error: "Không thể theo dõi. Vui lòng thử lại." }, { status: 500 });
    }
    following = true;
  }

  return NextResponse.json({ following });
}
