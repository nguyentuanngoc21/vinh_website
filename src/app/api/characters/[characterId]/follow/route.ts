import { NextResponse } from "next/server";
import { getRequestContext, requestError } from "@/lib/mobile/request-context";

/**
 * POST /api/characters/:characterId/follow — toggle theo dõi 1 nhân vật
 * (bấm lại = bỏ theo dõi). Cùng pattern
 * src/app/api/authors/[authorId]/follow/route.ts: select trước rồi
 * branch insert/delete, dùng service-role + userId resolve qua
 * getAuthedUserId().
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ characterId: string }> }
) {
  const { characterId } = await params;
  let auth;
  try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
  const { client: supabase, userId } = auth;
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
