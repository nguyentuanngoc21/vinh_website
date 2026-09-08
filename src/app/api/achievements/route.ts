import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { AchievementService } from "@/lib/quests/achievement-service";

/**
 * Thành tựu của user — 1 khung chung cho mọi role (tác giả/người thu âm/
 * thiết kế/đọc giả), tự đồng bộ (lazy-pull) trước khi trả về, giống
 * /api/quests/pool tự tạo pool hôm nay. FE lọc/tô màu theo `forRole`.
 */
export async function GET() {
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const achievements = await AchievementService.listForUser(supabase, userId);
  return NextResponse.json({ achievements });
}
