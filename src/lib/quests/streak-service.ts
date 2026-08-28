import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { STREAK_RESCUE_TOKEN_COST } from "@/lib/quests/config";
import { RewardEngine, type QuestResult } from "@/lib/quests/reward-engine";

type Client = SupabaseClient<Database>;
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type StreakMilestoneRow = Database["public"]["Tables"]["streak_milestones"]["Row"];

export type RecordReadingActivityResult = {
  profile: ProfileRow;
  /** Milestones this call just pushed over the claim threshold AND
   * successfully claimed — empty on almost every call (most reads don't
   * cross a milestone). UI can use this to show a "streak milestone!"
   * toast without a separate "nhận thưởng" tap. */
  newlyAwardedMilestones: StreakMilestoneRow[];
};

/**
 * `supabase` must be the service-role client — sync_reading_streak() and
 * rescue_streak_with_tokens() both have EXECUTE revoked from
 * anon/authenticated (see migrations/20260827_add_streak_sync_functions.sql).
 */
export const StreakService = {
  /**
   * Call on every genuine reading-activity event (chapter opened, a
   * reading_session recorded, etc.) — NOT on passive status checks (e.g.
   * just viewing the profile page); reading is what's supposed to extend
   * a streak, so only call this from an actual read event. Runs the full
   * rest-day-bank / at-risk state machine (sync_reading_streak(), see that
   * migration for the exact rules), then auto-claims any streak_milestones
   * newly within reach — matches Duolingo surfacing a streak-milestone
   * screen immediately, not gating it behind a separate claim action.
   */
  async recordReadingActivity(
    supabase: Client,
    params: { userId: string; activityDate?: string }
  ): Promise<RecordReadingActivityResult> {
    const { data: profile, error } = await supabase.rpc("sync_reading_streak", {
      p_user_id: params.userId,
      p_activity_date: params.activityDate,
    });
    // Only expected to fail if userId is bad (profile not found) — not a
    // normal business rejection, so throw rather than return {ok:false},
    // matching WithdrawalService.handlePayoutResult's precedent for RPCs
    // that "should never fail in normal operation".
    if (error || !profile) throw error ?? new Error("sync_reading_streak returned no profile");

    const [{ data: reached }, { data: claims }] = await Promise.all([
      supabase
        .from("streak_milestones")
        .select("*")
        .lte("streak_days", profile.current_quest_streak)
        .order("streak_days", { ascending: true }),
      supabase.from("user_streak_milestone_claims").select("streak_milestone_id").eq("user_id", params.userId),
    ]);

    const alreadyClaimed = new Set((claims ?? []).map((c) => c.streak_milestone_id));
    const unclaimed = (reached ?? []).filter((m) => !alreadyClaimed.has(m.id));

    const newlyAwarded: StreakMilestoneRow[] = [];
    for (const milestone of unclaimed) {
      // Sequential, not parallel — these are rare (a handful of
      // milestones over a user's lifetime) and each is its own DB
      // transaction; no need to optimize for concurrency here.
      const result = await RewardEngine.claimStreakMilestone(supabase, {
        userId: params.userId,
        streakMilestoneId: milestone.id,
      });
      if (result.ok) newlyAwarded.push(milestone);
      // A failure here (race with another request claiming the same
      // milestone concurrently) is swallowed — it must not fail the read
      // event that triggered this call.
    }

    return { profile, newlyAwardedMilestones: newlyAwarded };
  },

  /**
   * User-initiated: pay STREAK_RESCUE_TOKEN_COST to save an at-risk streak
   * within the 48h grace window. Fails (ok:false) if the streak isn't
   * at-risk, grace has expired, or the balance is insufficient —
   * apply_transaction() inside the RPC raises for the balance case.
   */
  async rescueStreak(supabase: Client, params: { userId: string }): Promise<QuestResult<ProfileRow>> {
    const { data, error } = await supabase.rpc("rescue_streak_with_tokens", {
      p_user_id: params.userId,
      p_token_cost: STREAK_RESCUE_TOKEN_COST,
    });
    if (error) return { ok: false, error: error.message || "Không thể cứu streak." };
    return { ok: true, data };
  },
};
