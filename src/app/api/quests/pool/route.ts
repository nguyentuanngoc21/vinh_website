import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { QuestPoolService } from "@/lib/quests/quest-pool-service";
import { MAX_QUEST_RESETS_PER_DAY } from "@/lib/quests/config";

/**
 * Pool hôm nay của user — tự tạo (idempotent) nếu chưa có, join với
 * task_templates (nội dung quest) + user_daily_tasks (tiến trình) để
 * trả về 1 shape UI dùng được ngay, không phải tự ghép 3 bảng ở client.
 */
export async function GET() {
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const generated = await QuestPoolService.generateTodayPool(supabase, { userId });
  if (!generated.ok) {
    return NextResponse.json({ error: generated.error }, { status: 400 });
  }

  const pool = generated.data;
  if (pool.length === 0) {
    return NextResponse.json({ poolDate: null, slots: [], resetsUsedToday: 0, maxResetsPerDay: MAX_QUEST_RESETS_PER_DAY });
  }

  const poolDate = pool[0].pool_date;
  const templateIds = pool.map((p) => p.task_template_id);

  const [{ data: templates, error: templatesError }, { data: dailyTasks, error: dailyTasksError }] = await Promise.all([
    supabase.from("task_templates").select("*").in("id", templateIds),
    supabase.from("user_daily_tasks").select("*").eq("user_id", userId).eq("task_date", poolDate).in("template_id", templateIds),
  ]);
  if (templatesError) return NextResponse.json({ error: templatesError.message }, { status: 500 });
  if (dailyTasksError) return NextResponse.json({ error: dailyTasksError.message }, { status: 500 });

  const templateById = new Map((templates ?? []).map((t) => [t.id, t]));
  const dailyTaskByTemplateId = new Map((dailyTasks ?? []).map((d) => [d.template_id, d]));

  const slots = pool
    .map((p) => {
      const template = templateById.get(p.task_template_id);
      const dailyTask = dailyTaskByTemplateId.get(p.task_template_id);
      // Không nên xảy ra (create_quest_pool_for_today() luôn tạo cả 2
      // cùng lúc) — nhưng nếu lệch dữ liệu vì lý do gì, bỏ slot đó khỏi
      // response thay vì làm hỏng cả trang.
      if (!template || !dailyTask) return null;
      return {
        slotIndex: p.slot_index,
        taskTemplateId: template.id,
        userDailyTaskId: dailyTask.id,
        title: template.title,
        description: template.description,
        questType: template.quest_type,
        targetCount: template.target_count,
        rewardTokens: template.reward_tokens,
        progress: dailyTask.progress,
        completed: dailyTask.completed,
        claimed: dailyTask.claimed,
        resetCount: dailyTask.reset_count,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .sort((a, b) => a.slotIndex - b.slotIndex);

  const resetsUsedToday = await QuestPoolService.getResetsUsedToday(supabase, { userId, poolDate });

  return NextResponse.json({
    poolDate,
    slots,
    resetsUsedToday,
    maxResetsPerDay: MAX_QUEST_RESETS_PER_DAY,
  });
}
