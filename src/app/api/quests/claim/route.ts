import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { RewardEngine } from "@/lib/quests/reward-engine";

/** Nhận thưởng 1 quest task_template đã hoàn thành hôm nay — bọc thẳng
 * claim_daily_task() (đã có sẵn, không đổi hành vi). Body: { taskId }
 * (user_daily_tasks.id, KHÔNG phải task_template_id). */
export async function POST(request: Request) {
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const taskId = typeof body?.taskId === "string" ? body.taskId : null;
  if (!taskId) {
    return NextResponse.json({ error: "Thiếu taskId." }, { status: 400 });
  }

  const result = await RewardEngine.claimDailyTask(supabase, { userId, taskId });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, transaction: result.data });
}
