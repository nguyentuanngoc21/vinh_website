import { NextResponse } from "next/server";
import { getRequestContext, requestError } from "@/lib/mobile/request-context";
import { isUuid } from "@/lib/validation/uuid";

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
  if (!isUuid(characterId)) return NextResponse.json({ error: "Nhân vật không hợp lệ." }, { status: 400 });
  let auth;
  try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
  const { client: supabase, userId } = auth;
  if (!userId) {
    return NextResponse.json({ error: "Vui lòng đăng nhập để theo dõi." }, { status: 401 });
  }

  const { data: existing, error: lookupError } = await supabase
    .from("character_follows")
    .select("character_id")
    .eq("follower_id", userId)
    .eq("character_id", characterId)
    .maybeSingle();
  if (lookupError) return NextResponse.json({ error: "Không kiểm tra được trạng thái theo dõi." }, { status: 500 });

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
    const { data: visible, error: visibilityError } = await supabase.from("public_characters").select("id").eq("id", characterId).maybeSingle();
    if (visibilityError) return NextResponse.json({ error: "Không kiểm tra được nhân vật." }, { status: 500 });
    if (!visible) return NextResponse.json({ error: "Nhân vật chưa công khai hoặc đã lưu trữ." }, { status: 404 });
    const { error } = await supabase.from("character_follows").insert({ follower_id: userId, character_id: characterId });
    if (error && error.code !== "23505") {
      console.error("[character-follow] insert failed:", error);
      return NextResponse.json({ error: "Không thể theo dõi. Vui lòng thử lại." }, { status: 500 });
    }
    following = true;
  }

  return NextResponse.json({ following });
}
