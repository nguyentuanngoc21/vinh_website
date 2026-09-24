import { NextResponse } from "next/server";
import { getRequestContext, requestError } from "@/lib/mobile/request-context";
import { QuestPoolService } from "@/lib/quests/quest-pool-service";

/** Đổi 1 quest trong pool hôm nay — QuestPoolService tự chọn quest thay
 * thế (cùng quest_type, ngoài cooldown), RPC enforce ngân sách 3 lần/ngày
 * CHUNG cho cả pool. Body: { taskTemplateId }. */
export async function POST(request: Request) {
  let auth;
  try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
  const { client: supabase, userId } = auth;
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
