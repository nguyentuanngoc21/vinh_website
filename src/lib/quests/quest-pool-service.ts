import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, QuestType } from "@/lib/supabase/types";
import {
  DAILY_POOL_MAX_SIZE,
  DAILY_POOL_MIN_SIZE,
  MAX_QUEST_RESETS_PER_DAY,
  QUEST_RESET_COOLDOWN_DAYS,
  QUEST_TYPE_WEIGHTS,
} from "@/lib/quests/config";
import type { QuestResult } from "@/lib/quests/reward-engine";

type Client = SupabaseClient<Database>;
type TaskTemplateRow = Database["public"]["Tables"]["task_templates"]["Row"];
type UserQuestPoolRow = Database["public"]["Tables"]["user_quest_pool"]["Row"];

/** YYYY-MM-DD theo giờ UTC của server — khớp với `current_date` mặc định
 * của cột `date` trong Postgres (server DB cũng chạy UTC trên Supabase).
 * Không cố gắng theo timezone của từng user — "1 ngày" trong hệ thống
 * này là 1 khái niệm server-side, giống task_date của user_daily_tasks. */
function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function weightOf(t: Pick<TaskTemplateRow, "quest_type">): number {
  return QUEST_TYPE_WEIGHTS[(t.quest_type as QuestType) ?? "topup"] ?? 1;
}

/** Random 1 item, xác suất tỉ lệ theo weight(item) — item weight <= 0 bị
 * loại (không bao giờ được chọn, không phải "hiếm khi"). */
function weightedPick<T>(items: T[], weight: (item: T) => number): T | null {
  const weighted = items.filter((i) => weight(i) > 0);
  const total = weighted.reduce((sum, i) => sum + weight(i), 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const item of weighted) {
    r -= weight(item);
    if (r <= 0) return item;
  }
  return weighted[weighted.length - 1];
}

/** weightedPick lặp lại, KHÔNG lặp lại item đã chọn (rút dần khỏi pool). */
function weightedPickDistinct<T>(items: T[], count: number, weight: (item: T) => number): T[] {
  const pool = [...items];
  const picked: T[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const chosen = weightedPick(pool, weight);
    if (!chosen) break;
    picked.push(chosen);
    pool.splice(pool.indexOf(chosen), 1);
  }
  return picked;
}

/** quest_id (task_templates.id) nào của user này đang trong cooldown
 * (bị reset ra trong QUEST_RESET_COOLDOWN_DAYS ngày gần nhất, tính từ
 * poolDate) — LOẠI HẲN khỏi ứng viên random, không giảm % dần. */
async function getCooldownTemplateIds(supabase: Client, userId: string, poolDate: string): Promise<Set<string>> {
  const cooldownSince = new Date(poolDate);
  cooldownSince.setDate(cooldownSince.getDate() - QUEST_RESET_COOLDOWN_DAYS);

  const { data } = await supabase
    .from("quest_reset_events")
    .select("quest_id")
    .eq("user_id", userId)
    .eq("quest_source", "task_template")
    .gte("created_at", cooldownSince.toISOString());

  return new Set((data ?? []).map((r) => r.quest_id));
}

/** Ranh giới 1 ngày UTC theo poolDate — dùng để lọc created_at bằng
 * gte/lt thay vì cắt chuỗi ngày (PostgREST không có toán tử ::date). */
function dayBoundsUtc(poolDate: string): { start: string; end: string } {
  const start = new Date(`${poolDate}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Random daily quest pool (spec mục 1.3) — service layer TÍNH TOÁN chọn
 * quest nào (trọng số + cooldown + ràng buộc tối thiểu discovery/
 * engagement/khác), rồi giao cho RPC ghi ATOMIC (migrations/
 * 20260828_add_user_quest_pool.sql — create_quest_pool_for_today,
 * reset_quest_pool_slot). `supabase` phải là service-role client — cả 2
 * RPC đều revoke execute khỏi anon/authenticated.
 */
export const QuestPoolService = {
  /** Đọc pool hôm nay (hoặc ngày chỉ định) — không tạo mới, chỉ đọc. */
  async getPool(supabase: Client, params: { userId: string; poolDate?: string }): Promise<UserQuestPoolRow[]> {
    const poolDate = params.poolDate ?? todayIsoDate();
    const { data, error } = await supabase
      .from("user_quest_pool")
      .select("*")
      .eq("user_id", params.userId)
      .eq("pool_date", poolDate)
      .order("slot_index", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  /** Số lần đã reset TRONG NGÀY — cùng công thức reset_quest_pool_slot()
   * dùng để enforce giới hạn (COUNT quest_reset_events), tách ra đây chỉ
   * để UI hiện "còn N lượt đổi" trước khi user bấm, không phải nguồn
   * enforce thật (RPC vẫn tự đếm lại, đây chỉ là hiển thị). */
  async getResetsUsedToday(supabase: Client, params: { userId: string; poolDate?: string }): Promise<number> {
    const poolDate = params.poolDate ?? todayIsoDate();
    const { start, end } = dayBoundsUtc(poolDate);
    const { count } = await supabase
      .from("quest_reset_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", params.userId)
      .eq("quest_source", "task_template")
      .gte("created_at", start)
      .lt("created_at", end);
    return count ?? 0;
  },

  /**
   * Idempotent — nếu pool hôm nay đã tồn tại (gọi lại, hoặc RPC tự phát
   * hiện race), trả về pool đã có, KHÔNG tạo/chọn lại từ đầu.
   */
  async generateTodayPool(
    supabase: Client,
    params: { userId: string; poolDate?: string }
  ): Promise<QuestResult<UserQuestPoolRow[]>> {
    const poolDate = params.poolDate ?? todayIsoDate();

    const existing = await this.getPool(supabase, { userId: params.userId, poolDate });
    if (existing.length > 0) return { ok: true, data: existing };

    const { data: templates, error: templatesError } = await supabase
      .from("task_templates")
      .select("*")
      .eq("active", true)
      .not("quest_type", "is", null);
    if (templatesError) return { ok: false, error: templatesError.message };
    if (!templates || templates.length === 0) {
      return { ok: false, error: "Chưa có quest nào khả dụng để tạo pool hôm nay." };
    }

    const cooldownIds = await getCooldownTemplateIds(supabase, params.userId, poolDate);
    const eligible = templates.filter((t) => !cooldownIds.has(t.id));

    const byType = (type: QuestType) => eligible.filter((t) => t.quest_type === type);

    // 3 slot bắt buộc: 1 discovery + 1 engagement + 1 loại khác. Nếu 1
    // trong 3 không có ứng viên (vd pool quá nhỏ ở giai đoạn đầu), BỎ
    // QUA slot đó thay vì chặn hẳn việc tạo pool — 1 ngày thiếu 1 loại
    // quest vẫn tốt hơn không có pool nào.
    const discoveryPick = weightedPick(byType("discovery"), weightOf);
    const engagementPick = weightedPick(byType("engagement"), weightOf);
    const otherPick = weightedPick(
      eligible.filter((t) => t.quest_type !== "discovery" && t.quest_type !== "engagement"),
      weightOf
    );
    const guaranteed = [discoveryPick, engagementPick, otherPick].filter((t) => t !== null) as TaskTemplateRow[];

    const poolSize = DAILY_POOL_MIN_SIZE + Math.floor(Math.random() * (DAILY_POOL_MAX_SIZE - DAILY_POOL_MIN_SIZE + 1));
    const remainingSlots = Math.max(0, poolSize - guaranteed.length);
    const remainingPool = eligible.filter((t) => !guaranteed.some((g) => g.id === t.id));
    const extraPicks = weightedPickDistinct(remainingPool, remainingSlots, weightOf);

    const selected = [...guaranteed, ...extraPicks];
    if (selected.length === 0) {
      return { ok: false, error: "Không còn quest nào khả dụng sau khi áp cooldown." };
    }

    const { data, error } = await supabase.rpc("create_quest_pool_for_today", {
      p_user_id: params.userId,
      p_pool_date: poolDate,
      p_task_template_ids: selected.map((t) => t.id),
    });
    if (error) return { ok: false, error: error.message || "Không thể tạo pool nhiệm vụ hôm nay." };
    return { ok: true, data: data ?? [] };
  },

  /**
   * Đổi 1 quest trong pool hôm nay. Quest thay vào LUÔN CÙNG quest_type
   * với quest bị thay ra — bắt buộc, để không phá ràng buộc "tối thiểu 1
   * discovery/1 engagement/1 khác" của ngày đó (xem
   * migrations/20260828_add_user_quest_pool.sql). Ngân sách reset CHUNG
   * 3 lần/ngày cho cả pool — enforce thật ở RPC (đếm quest_reset_events),
   * đây chỉ truyền MAX_QUEST_RESETS_PER_DAY vào, không tự kiểm trước.
   */
  async resetQuestInPool(
    supabase: Client,
    params: { userId: string; poolDate?: string; taskTemplateId: string }
  ): Promise<QuestResult<UserQuestPoolRow>> {
    const poolDate = params.poolDate ?? todayIsoDate();

    const currentPool = await this.getPool(supabase, { userId: params.userId, poolDate });
    const target = currentPool.find((p) => p.task_template_id === params.taskTemplateId);
    if (!target) return { ok: false, error: "Quest này không nằm trong pool hôm nay." };

    const { data: targetTemplate, error: templateError } = await supabase
      .from("task_templates")
      .select("*")
      .eq("id", params.taskTemplateId)
      .single();
    if (templateError || !targetTemplate?.quest_type) {
      return { ok: false, error: "Không tìm thấy quest cần đổi." };
    }

    const cooldownIds = await getCooldownTemplateIds(supabase, params.userId, poolDate);
    const currentPoolIds = new Set(currentPool.map((p) => p.task_template_id));

    const { data: sameTypeCandidates, error: candidatesError } = await supabase
      .from("task_templates")
      .select("*")
      .eq("active", true)
      .eq("quest_type", targetTemplate.quest_type);
    if (candidatesError) return { ok: false, error: candidatesError.message };

    const eligible = (sameTypeCandidates ?? []).filter(
      (t) => t.id !== params.taskTemplateId && !cooldownIds.has(t.id) && !currentPoolIds.has(t.id)
    );
    const replacement = weightedPick(eligible, weightOf);
    if (!replacement) {
      return {
        ok: false,
        error: "Không còn quest cùng loại để thay — mọi lựa chọn khác đang cooldown hoặc đã có trong pool hôm nay.",
      };
    }

    const { data, error } = await supabase.rpc("reset_quest_pool_slot", {
      p_user_id: params.userId,
      p_pool_date: poolDate,
      p_task_template_id: params.taskTemplateId,
      p_replacement_template_id: replacement.id,
      p_max_resets_per_day: MAX_QUEST_RESETS_PER_DAY,
    });
    if (error) return { ok: false, error: error.message || "Không thể đổi quest." };
    return { ok: true, data };
  },
};
