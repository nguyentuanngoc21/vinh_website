import { NextResponse } from "next/server";
import { getRequestContext, requestError } from "@/lib/mobile/request-context";
import { AchievementService } from "@/lib/quests/achievement-service";

/**
 * Thành tựu của user — 1 khung chung cho mọi role (tác giả/người thu âm/
 * thiết kế/đọc giả), tự đồng bộ (lazy-pull) trước khi trả về, giống
 * /api/quests/pool tự tạo pool hôm nay. FE lọc/tô màu theo `forRole`.
 */
export async function GET(request: Request) {
  let auth;
  try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
  const { client: supabase, userId } = auth;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const achievements = await AchievementService.listForUser(supabase, userId);
  return NextResponse.json({ achievements });
}
