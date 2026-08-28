import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { QuestPoolService } from "@/lib/quests/quest-pool-service";

/** Đổi 1 quest trong pool hôm nay — QuestPoolService tự chọn quest thay
 * thế (cùng quest_type, ngoài cooldown), RPC enforce ngân sách 3 lần/ngày
 * CHUNG cho cả pool. Body: { taskTemplateId }. */
export async function POST(request: Request) {
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const taskTemplateId = typeof body?.taskTemplateId === "string" ? body.taskTemplateId : null;
  if (!taskTemplateId) {
    return NextResponse.json({ error: "Thiếu taskTemplateId." }, { status: 400 });
  }

  const result = await QuestPoolService.resetQuestInPool(supabase, { userId, taskTemplateId });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, slot: result.data });
}
