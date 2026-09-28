/**
 * Chụp hạng BXH mỗi ngày và đọc lại để tính cột "Thay đổi" (Phase 3,
 * Slice 3.4 — K9). Service-role (bảng chụp không mở cho anon/authenticated).
 *
 *   - snapshotAllRanks(): cron 00:05 giờ VN, sau khi tính lại bảng điểm —
 *     SQL tự chọn bảng theo giai đoạn và bỏ qua ngày đã chụp.
 *   - loadRankChanges(): bản chụp mới nhất của hôm nay (hoặc hôm qua nếu cron
 *     hôm nay chưa chạy); không có bản chụp → null (BXH ẩn cột). Lỗi chỉ ghi
 *     log — BXH vẫn hiển thị.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { throwIfError } from "@/lib/contests/errors";
import { vnDateKey } from "@/lib/contests/datetime";
import { rankChange, type RankChange } from "@/lib/contests/rank-change";
import { SCORING_ACTIVE_STATUSES } from "@/lib/contests/scores-service";

type Client = SupabaseClient<Database>;
export type SnapshotKind = "popular" | "trending";

export type RankSnapshotCronResult = { snapshotted: { slug: string; rows: number }[]; errors: string[] };

export async function snapshotAllRanks(client: Client): Promise<RankSnapshotCronResult> {
  const result: RankSnapshotCronResult = { snapshotted: [], errors: [] };
  const { data, error } = await client.from("contests").select("id, slug").in("status", SCORING_ACTIVE_STATUSES);
  throwIfError(error, "load contests for rank snapshot");
  for (const c of data ?? []) {
    const { data: rows, error: rpcError } = await client.rpc("snapshot_contest_ranks", { p_contest_id: c.id });
    if (rpcError) result.errors.push(`rank snapshot ${c.slug}: ${rpcError.message}`);
    else if (rows) result.snapshotted.push({ slug: c.slug, rows });
  }
  return result;
}

export async function loadRankChanges(
  client: Client,
  input: { contestId: string; kind: SnapshotKind; rows: { submission_id: string; rank: number }[]; now?: Date }
): Promise<Map<string, RankChange> | null> {
  const now = input.now ?? new Date();
  try {
    const { data: latest, error } = await client
      .from("contest_rank_snapshots")
      .select("snapshot_day")
      .eq("contest_id", input.contestId)
      .eq("kind", input.kind)
      .gte("snapshot_day", vnDateKey(now, -1))
      .lte("snapshot_day", vnDateKey(now))
      .order("snapshot_day", { ascending: false })
      .limit(1)
      .maybeSingle();
    throwIfError(error, "load latest rank snapshot");
    if (!latest) return null;
    const changes = new Map<string, RankChange>();
    if (input.rows.length === 0) return changes;

    const { data, error: ranksError } = await client
      .from("contest_rank_snapshots")
      .select("submission_id, rank")
      .eq("contest_id", input.contestId)
      .eq("kind", input.kind)
      .eq("snapshot_day", latest.snapshot_day)
      .in("submission_id", input.rows.map((r) => r.submission_id));
    throwIfError(ranksError, "load rank snapshot rows");
    const previous = new Map((data ?? []).map((r) => [r.submission_id, r.rank]));
    for (const r of input.rows) changes.set(r.submission_id, rankChange(previous.get(r.submission_id), r.rank));
    return changes;
  } catch (error) {
    console.error("[contests] rank changes failed:", error);
    return null;
  }
}
