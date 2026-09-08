import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;
type AchievementTemplateRow = Database["public"]["Tables"]["achievement_templates"]["Row"];

export type AchievementView = {
  id: string;
  code: string;
  forRole: AchievementTemplateRow["for_role"];
  title: string;
  description: string | null;
  icon: string | null;
  colorToken: string;
  rewardTokens: number;
  unlocked: boolean;
  unlockedAt: string | null;
  // Chỉ có ở thành tựu metric-based CHƯA mở khoá — cho FE vẽ progress bar
  // (vd "3/5 truyện"). null cho thành tựu đã unlock (không cần nữa) và
  // cho loại streak-linked (metric NULL — tiến trình thật là
  // profiles.current_quest_streak, hình dạng khác, chưa hiện ở đây).
  progress: { current: number; target: number } | null;
};

/**
 * Đọc + đồng bộ thành tựu của 1 user — 1 khung chung cho mọi loại thành
 * tựu (metric-based: author/narrator/designer, VÀ streak-linked qua
 * streak_milestones.badge_id), lọc/tô màu theo forRole ở tầng UI (NULL =
 * chung/đọc giả). Xem migrations/20260908_add_achievements.sql.
 */
export const AchievementService = {
  async listForUser(supabase: Client, userId: string): Promise<AchievementView[]> {
    // Lazy-pull: cấp (+ thưởng nếu có) mọi achievement_templates metric-based
    // mà user vừa đủ điều kiện, TRƯỚC khi đọc lại — cùng cách
    // increment_task_progress() tự tạo dòng nhiệm vụ hôm nay, không cần
    // chờ cron. Không throw nếu lỗi — hiển thị thành tựu cũ vẫn tốt hơn
    // là hỏng cả trang vì 1 lần đồng bộ thất bại.
    await supabase.rpc("sync_user_achievements", { p_user_id: userId });

    const [templatesRes, userAchievementsRes, streakMilestonesRes, streakClaimsRes, metricCounts] = await Promise.all([
      supabase.from("achievement_templates").select("*").eq("active", true),
      supabase.from("user_achievements").select("achievement_id, unlocked_at").eq("user_id", userId),
      // Chỉ những mốc đã gắn badge_id (đa số hàng cũ hiện vẫn NULL cho tới
      // khi admin gán) — không phải mọi streak_milestones đều tham gia
      // khung thành tựu.
      supabase.from("streak_milestones").select("id, badge_id").not("badge_id", "is", null),
      supabase.from("user_streak_milestone_claims").select("streak_milestone_id, claimed_at").eq("user_id", userId),
      getMetricCounts(supabase, userId),
    ]);

    const templates = templatesRes.data ?? [];
    const unlockedByAchievementId = new Map(
      (userAchievementsRes.data ?? []).map((r) => [r.achievement_id, r.unlocked_at])
    );
    // badge_id (achievement_templates.id) -> streak_milestones.id — để tra
    // ngược từ 1 hàng achievement_templates streak-linked sang đúng mốc.
    const streakMilestoneIdByBadgeId = new Map(
      (streakMilestonesRes.data ?? [])
        .filter((m): m is { id: string; badge_id: string } => m.badge_id !== null)
        .map((m) => [m.badge_id, m.id])
    );
    const claimedAtByStreakMilestoneId = new Map(
      (streakClaimsRes.data ?? []).map((c) => [c.streak_milestone_id, c.claimed_at])
    );

    return templates.map((t) => {
      // metric-based (author/narrator/designer): unlock ghi trực tiếp ở
      // user_achievements bởi sync_user_achievements() phía trên.
      if (t.metric !== null) {
        const unlockedAt = unlockedByAchievementId.get(t.id) ?? null;
        const unlocked = unlockedAt !== null;
        const progress = unlocked ? null : { current: metricCounts[t.metric], target: t.threshold ?? 0 };
        return toView(t, unlocked, unlockedAt, progress);
      }

      // streak-linked (metric NULL): unlock thật nằm ở
      // user_streak_milestone_claims, tra qua streak_milestones.badge_id.
      // Chưa gắn badge_id nào (admin chưa cấu hình) → coi như thành tựu
      // tĩnh, chưa unlock được, không phải lỗi. Chưa hiện progress cho
      // loại này (tiến trình thật là profiles.current_quest_streak so với
      // streak_milestones.streak_days — hình dạng khác, để sau).
      const streakMilestoneId = streakMilestoneIdByBadgeId.get(t.id);
      const unlockedAt = streakMilestoneId ? (claimedAtByStreakMilestoneId.get(streakMilestoneId) ?? null) : null;
      return toView(t, unlockedAt !== null, unlockedAt, null);
    });
  },
};

/** COUNT thật cho từng metric — dùng để hiện progress bar của thành tựu
 * CHƯA unlock. Cùng bảng/cột với getUnlockedRoles() (creator-roles.ts)
 * nhưng cần số đếm thật (so ngưỡng), không chỉ có/không, nên tách riêng
 * thay vì tái dùng thẳng hàm đó. */
async function getMetricCounts(
  supabase: Client,
  userId: string
): Promise<Record<"books_published" | "audio_published" | "design_published", number>> {
  const [booksRes, audioRes, designRes] = await Promise.all([
    supabase.from("books").select("id", { count: "exact", head: true }).eq("author_id", userId).eq("published", true),
    supabase.from("audio_narrations").select("id", { count: "exact", head: true }).eq("narrator_id", userId),
    supabase.from("design_items").select("id", { count: "exact", head: true }).eq("illustrator_id", userId),
  ]);
  return {
    books_published: booksRes.count ?? 0,
    audio_published: audioRes.count ?? 0,
    design_published: designRes.count ?? 0,
  };
}

function toView(
  t: AchievementTemplateRow,
  unlocked: boolean,
  unlockedAt: string | null,
  progress: AchievementView["progress"]
): AchievementView {
  return {
    id: t.id,
    code: t.code,
    forRole: t.for_role,
    title: t.title,
    description: t.description,
    icon: t.icon,
    colorToken: t.color_token,
    rewardTokens: t.reward_tokens,
    unlocked,
    unlockedAt,
    progress,
  };
}
