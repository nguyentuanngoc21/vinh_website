import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;
type TransactionRow = Database["public"]["Tables"]["transactions"]["Row"];
type UserDailyTaskRow = Database["public"]["Tables"]["user_daily_tasks"]["Row"];

export type QuestResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Shapes of hidden_quests.unlock_condition (jsonb — no DB-level schema,
 * shape varies per campaign, see migrations/20260827_add_hidden_quests.sql).
 * Add a new variant + branch in isUnlockConditionMet() for every new
 * campaign type that ships. Unknown/malformed conditions fail CLOSED
 * (never unlock) — see the `default` branch below.
 */
type UnlockCondition = { type: "read_streak"; days: number } | { type: "book_completed"; bookId: string };

async function isUnlockConditionMet(supabase: Client, userId: string, condition: UnlockCondition): Promise<boolean> {
  switch (condition.type) {
    case "read_streak": {
      const { data } = await supabase.from("profiles").select("current_quest_streak").eq("id", userId).single();
      return (data?.current_quest_streak ?? 0) >= condition.days;
    }
    case "book_completed": {
      // "Hoàn thành" = đã đọc chương is_last_chapter=true của sách đó.
      // Dùng reading_history (log đầy đủ), KHÔNG dùng book_progress —
      // book_progress chỉ giữ chương ĐỌC GẦN NHẤT, không phải toàn bộ
      // lịch sử, nên không chứng minh được "đã từng đọc chương cuối".
      const { data: lastChapter } = await supabase
        .from("chapters")
        .select("id")
        .eq("book_id", condition.bookId)
        .eq("is_last_chapter", true)
        .maybeSingle();
      if (!lastChapter) return false;

      const { count } = await supabase
        .from("reading_history")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("chapter_id", lastChapter.id);
      return (count ?? 0) > 0;
    }
    default:
      return false;
  }
}

/**
 * Reward engine (spec mục 1.2) — the one place quest completions turn
 * into token grants. Every method here ends up calling apply_transaction()
 * (directly, or via a security-definer RPC that itself calls it) — never
 * writes a balance directly, never hardcodes a reward amount: task_template
 * rewards come from task_templates.reward_tokens, hidden_quest rewards from
 * hidden_quests.reward_tokens, both already resolved server-side inside the
 * RPCs below.
 *
 * Double-claim protection is per-source, not centralized here:
 * user_daily_tasks.claimed, user_hidden_quest_progress's unique constraint,
 * user_streak_milestone_claims's unique constraint. 1 reading action is
 * allowed to satisfy multiple DIFFERENT quests at once (by design) — only
 * claiming the SAME quest twice is blocked.
 *
 * `supabase` must be the service-role client — every RPC called here has
 * EXECUTE revoked from anon/authenticated (see the migrations), so calling
 * with the RLS-checked client will fail with a permission error.
 */
export const RewardEngine = {
  /** Wraps the pre-existing claim_daily_task() RPC (schema.sql phần 7) —
   * unchanged by Quest System, task_template quests reuse it as-is. */
  async claimDailyTask(supabase: Client, params: { userId: string; taskId: string }): Promise<QuestResult<TransactionRow>> {
    const { data, error } = await supabase.rpc("claim_daily_task", {
      p_user_id: params.userId,
      p_task_id: params.taskId,
    });
    if (error) return { ok: false, error: error.message || "Không thể nhận thưởng nhiệm vụ." };
    return { ok: true, data };
  },

  /** Wraps the pre-existing increment_task_progress() RPC — call on every
   * action that might advance a task_template's progress counter. */
  async incrementTaskProgress(
    supabase: Client,
    params: { userId: string; taskCode: string; amount?: number }
  ): Promise<QuestResult<UserDailyTaskRow>> {
    const { data, error } = await supabase.rpc("increment_task_progress", {
      p_user_id: params.userId,
      p_task_code: params.taskCode,
      p_amount: params.amount,
    });
    if (error) return { ok: false, error: error.message || "Không thể ghi nhận tiến trình nhiệm vụ." };
    return { ok: true, data };
  },

  /**
   * Checks unlock_condition (app-side — the shape isn't validatable in
   * SQL, see isUnlockConditionMet above), then calls complete_hidden_quest()
   * which does the atomic completed-check + apply_transaction().
   */
  async completeHiddenQuest(
    supabase: Client,
    params: { userId: string; hiddenQuestId: string }
  ): Promise<QuestResult<TransactionRow>> {
    const { data: quest, error: questError } = await supabase
      .from("hidden_quests")
      .select("unlock_condition")
      .eq("id", params.hiddenQuestId)
      .single();
    if (questError || !quest) return { ok: false, error: "Không tìm thấy nhiệm vụ ẩn." };

    const unlocked = await isUnlockConditionMet(supabase, params.userId, quest.unlock_condition as UnlockCondition);
    if (!unlocked) return { ok: false, error: "Chưa đủ điều kiện mở khoá nhiệm vụ này." };

    const { data, error } = await supabase.rpc("complete_hidden_quest", {
      p_user_id: params.userId,
      p_hidden_quest_id: params.hiddenQuestId,
    });
    if (error) return { ok: false, error: error.message || "Không thể hoàn thành nhiệm vụ ẩn." };
    return { ok: true, data };
  },

  /** Wraps claim_streak_milestone() — see StreakService.recordReadingActivity
   * for the usual (auto-claim) caller; exposed here too for a "nhận
   * thưởng" button UI if you want claiming to require an explicit tap. */
  async claimStreakMilestone(
    supabase: Client,
    params: { userId: string; streakMilestoneId: string }
  ): Promise<QuestResult<TransactionRow>> {
    const { data, error } = await supabase.rpc("claim_streak_milestone", {
      p_user_id: params.userId,
      p_streak_milestone_id: params.streakMilestoneId,
    });
    if (error) return { ok: false, error: error.message || "Không thể nhận thưởng mốc streak." };
    return { ok: true, data };
  },
};
