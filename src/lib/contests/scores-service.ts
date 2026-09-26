/**
 * Bảng điểm cache của cuộc thi (Phase 2, Slice 2.2 — P3, P8). Mọi số liệu
 * dựa trên tín hiệu (phiếu đã lọc, độc giả hợp lệ, độc giả mới 7 ngày) do
 * refresh_contest_scores() tính trong SQL và lưu ở contest_submission_scores:
 *
 *   - ensureFreshScores(): gọi khi có người xem số liệu — SQL tự bỏ qua nếu
 *     lần tính gần nhất chưa quá 15 phút, hoặc nếu một lần tính khác đang
 *     chạy (không chờ). Không bao giờ ném lỗi: số liệu cũ vẫn dùng được.
 *   - refreshAllActiveScores(): cron 0h giờ VN ép tính lại (lưới an toàn).
 *   - freezeScores(): lần tính cuối khi công bố kết quả, rồi chốt vĩnh viễn.
 *
 * BXH Độc giả yêu thích TRONG LÚC bình chọn không đọc bảng này — vẫn đếm
 * phiếu trực tiếp (get_contest_ranking).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContestStatus, Database } from "@/lib/supabase/types";
import { throwIfError } from "@/lib/contests/errors";

type Client = SupabaseClient<Database>;
export type ScoreState = Database["public"]["Tables"]["contest_score_state"]["Row"];
export type SubmissionScores = Database["public"]["Tables"]["contest_submission_scores"]["Row"];

/** Cuộc thi còn sinh tín hiệu mới (có người đọc / bình chọn) — cron làm mới. */
export const SCORING_ACTIVE_STATUSES: ContestStatus[] = ["submission_open", "submission_closed", "community_voting", "judging"];
/** Đã công bố kết quả — bảng điểm phải được chốt. */
export const SCORES_FINAL_STATUSES: ContestStatus[] = ["results", "archived"];

async function refresh(client: Client, contestId: string, opts: { force: boolean; freeze: boolean }): Promise<ScoreState> {
  const { data, error } = await client.rpc("refresh_contest_scores", {
    p_contest_id: contestId,
    p_force: opts.force,
    p_freeze: opts.freeze,
  });
  throwIfError(error, "refresh_contest_scores");
  return data as ScoreState;
}

export async function ensureFreshScores(client: Client, contestId: string): Promise<ScoreState | null> {
  try {
    return await refresh(client, contestId, { force: false, freeze: false });
  } catch (error) {
    console.error("[contests] refresh scores failed:", error);
    return null;
  }
}

export function freezeScores(client: Client, contestId: string): Promise<ScoreState> {
  return refresh(client, contestId, { force: true, freeze: true });
}

export async function getScoreState(client: Client, contestId: string): Promise<ScoreState | null> {
  const { data, error } = await client.from("contest_score_state").select("*").eq("contest_id", contestId).maybeSingle();
  throwIfError(error, "load score state");
  return data;
}

export async function getSubmissionScores(client: Client, submissionIds: string[]): Promise<Map<string, SubmissionScores>> {
  if (submissionIds.length === 0) return new Map();
  const { data, error } = await client.from("contest_submission_scores").select("*").in("submission_id", submissionIds);
  throwIfError(error, "load submission scores");
  return new Map((data ?? []).map((r) => [r.submission_id, r]));
}

export type ScoresCronResult = { refreshed: string[]; frozen: string[]; errors: string[] };

/**
 * Cron 0h VN: ép tính lại mọi cuộc thi đang diễn ra, và chốt cuộc thi đã công
 * bố kết quả mà chưa chốt (vd lần chốt lúc công bố bị lỗi).
 */
export async function refreshAllActiveScores(client: Client): Promise<ScoresCronResult> {
  const result: ScoresCronResult = { refreshed: [], frozen: [], errors: [] };
  const [active, finished, frozen] = await Promise.all([
    client.from("contests").select("id, slug").in("status", SCORING_ACTIVE_STATUSES),
    client.from("contests").select("id, slug").in("status", SCORES_FINAL_STATUSES).not("results_published_at", "is", null),
    client.from("contest_score_state").select("contest_id").not("frozen_at", "is", null),
  ]);
  throwIfError(active.error, "load active contests");
  throwIfError(finished.error, "load finished contests");
  throwIfError(frozen.error, "load frozen score state");
  const frozenIds = new Set((frozen.data ?? []).map((r) => r.contest_id));

  for (const c of active.data ?? []) {
    try {
      await refresh(client, c.id, { force: true, freeze: false });
      result.refreshed.push(c.slug);
    } catch (e) {
      result.errors.push(`${c.slug}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  for (const c of (finished.data ?? []).filter((c) => !frozenIds.has(c.id))) {
    try {
      await freezeScores(client, c.id);
      result.frozen.push(c.slug);
    } catch (e) {
      result.errors.push(`${c.slug}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return result;
}
