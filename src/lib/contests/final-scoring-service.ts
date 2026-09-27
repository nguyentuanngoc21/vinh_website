/**
 * Lượt tính điểm chung cuộc (Slice 2.6a). Nối số liệu SQL
 * (get_contest_scoring_metrics) → engine thuần (final-scoring/engine.ts) →
 * save_contest_score_run (lưu snapshot mọi tầng).
 *
 *   - 'preview': từ lúc khung chấm bắt đầu, xem bảng điểm tạm (cùng version
 *     cấu hình đang áp dụng — không thử công thức khác trên dữ liệu thật, J3 mục 15).
 *   - 'final': sau khi hết khung chấm; nếu require_all_judges thì mọi giám
 *     khảo đang gán phải chốt đủ mọi bài (J5).
 * input_digest = sha256(version + cấu hình + số liệu thô): 2 lượt cùng digest
 * phải ra cùng kết quả — dùng để kiểm lại.
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { ContestError, throwIfError } from "@/lib/contests/errors";
import { parseFinalScoringConfig, type FinalScoringConfig } from "@/lib/contests/final-scoring/config";
import { computeFinalScores, type EngineFlag, type SubmissionMetrics } from "@/lib/contests/final-scoring/engine";

type Client = SupabaseClient<Database>;
type ContestRow = Database["public"]["Tables"]["contests"]["Row"];
export type ScoreRunRow = Database["public"]["Tables"]["contest_score_runs"]["Row"];
export type ScoreSnapshotRow = Database["public"]["Tables"]["contest_score_snapshots"]["Row"];

async function activeConfig(client: Client, contest: ContestRow): Promise<{ version: number; config: FinalScoringConfig }> {
  if (contest.scoring_config_version === null) throw new ContestError("scoring_config_missing");
  const { data, error } = await client
    .from("contest_scoring_configs").select("config").eq("contest_id", contest.id).eq("version", contest.scoring_config_version).maybeSingle();
  throwIfError(error, "load active scoring config");
  const parsed = data ? parseFinalScoringConfig(data.config) : null;
  if (!parsed?.ok) throw new ContestError("scoring_config_missing");
  return { version: contest.scoring_config_version, config: parsed.value };
}

export async function loadScoringMetrics(client: Client, contestId: string): Promise<SubmissionMetrics[]> {
  const { data, error } = await client.rpc("get_contest_scoring_metrics", { p_contest_id: contestId });
  throwIfError(error, "get_contest_scoring_metrics");
  return (data ?? []).map((r) => ({
    submission_id: r.submission_id,
    submitted_at: r.submitted_at,
    has_snapshot: r.has_snapshot,
    valid_readers: r.valid_readers,
    reader_depths: (r.reader_depths ?? []).map(Number),
    returning_readers: r.returning_readers,
    engaged_readers: r.engaged_readers,
    valid_votes: r.valid_votes,
    judge_totals: (r.judge_totals ?? []).map(Number),
    active_judges: r.active_judges,
  }));
}

/** Băm tất định: khoá object sắp xếp, mảng giữ thứ tự (SQL đã sắp). */
function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as Record<string, unknown>).sort().map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

export function inputDigest(version: number, config: FinalScoringConfig, metrics: SubmissionMetrics[]): string {
  return createHash("sha256").update(stableStringify({ version, config, metrics })).digest("hex");
}

export async function computeScoreRun(
  client: Client,
  input: { contest: ContestRow; adminId: string; kind: "preview" | "final" }
): Promise<{ runId: string; flags: EngineFlag[] }> {
  const { version, config } = await activeConfig(client, input.contest);
  const metrics = await loadScoringMetrics(client, input.contest.id);
  const result = computeFinalScores(config, metrics);
  if (input.kind === "final" && config.require_all_judges && !result.judging_complete) {
    throw new ContestError("judging_incomplete");
  }
  const { data, error } = await client.rpc("save_contest_score_run", {
    p_contest_id: input.contest.id,
    p_admin_id: input.adminId,
    p_run: {
      kind: input.kind,
      config_version: version,
      input_digest: inputDigest(version, config, metrics),
      flags: result.flags,
      rows: result.rows,
    },
  });
  throwIfError(error, "save_contest_score_run");
  return { runId: data as string, flags: result.flags };
}

export type ScoreRunSummary = ScoreRunRow & {
  computed_by_name: string | null;
  /**
   * Số liệu / cấu hình đổi sau lượt tính → cần tính lại: version cấu hình
   * khác, phiếu chấm hoặc tín hiệu gian lận thay đổi sau thời điểm tính.
   */
  stale_reasons: string[];
};

export async function listScoreRuns(client: Client, contest: ContestRow): Promise<ScoreRunSummary[]> {
  const [runs, lastCard, lastSignal] = await Promise.all([
    client.from("contest_score_runs").select("*").eq("contest_id", contest.id).order("computed_at", { ascending: false }).limit(30),
    client.from("contest_judge_score_events").select("created_at").eq("contest_id", contest.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("contest_fraud_signals").select("reviewed_at").eq("contest_id", contest.id).not("reviewed_at", "is", null).order("reviewed_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  throwIfError(runs.error, "list score runs");
  throwIfError(lastCard.error, "last scorecard event");
  throwIfError(lastSignal.error, "last fraud review");
  const rows = runs.data ?? [];
  const ids = [...new Set(rows.map((r) => r.computed_by))];
  const { data: profiles, error: pError } = ids.length
    ? await client.from("profiles").select("id, nickname, username").in("id", ids)
    : { data: [], error: null };
  throwIfError(pError, "run authors");
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.nickname ?? p.username]));
  const cardAt = lastCard.data?.created_at ? Date.parse(lastCard.data.created_at) : null;
  const signalAt = lastSignal.data?.reviewed_at ? Date.parse(lastSignal.data.reviewed_at) : null;

  return rows.map((r) => {
    const at = Date.parse(r.computed_at);
    const stale: string[] = [];
    if (r.config_version !== contest.scoring_config_version) stale.push("Cấu hình chấm đã có version mới");
    if (cardAt !== null && cardAt > at) stale.push("Phiếu chấm thay đổi sau lượt tính");
    if (signalAt !== null && signalAt > at) stale.push("Tín hiệu gian lận được xét sau lượt tính");
    return { ...r, computed_by_name: nameById.get(r.computed_by) ?? null, stale_reasons: stale };
  });
}

export type ScoreRunDetail = {
  run: ScoreRunRow;
  rows: (ScoreSnapshotRow & { book_title: string; author_name: string })[];
};

export async function getScoreRun(client: Client, contestId: string, runId: string): Promise<ScoreRunDetail> {
  const { data: run, error } = await client.from("contest_score_runs").select("*").eq("id", runId).eq("contest_id", contestId).maybeSingle();
  throwIfError(error, "load score run");
  if (!run) throw new ContestError("score_run_not_found");
  const { data: snaps, error: sError } = await client.from("contest_score_snapshots").select("*").eq("run_id", runId).order("rank").order("submission_id");
  throwIfError(sError, "load score snapshots");
  const rows = snaps ?? [];
  const { data: subs, error: subError } = rows.length
    ? await client.from("contest_submissions").select("id, book_id, author_id").in("id", rows.map((r) => r.submission_id))
    : { data: [], error: null };
  throwIfError(subError, "load run submissions");
  const [books, profiles] = await Promise.all([
    (subs ?? []).length ? client.from("books").select("id, title").in("id", (subs ?? []).map((s) => s.book_id)) : Promise.resolve({ data: [], error: null }),
    (subs ?? []).length ? client.from("profiles").select("id, nickname, username").in("id", (subs ?? []).map((s) => s.author_id)) : Promise.resolve({ data: [], error: null }),
  ]);
  throwIfError(books.error, "load run books");
  throwIfError(profiles.error, "load run authors");
  const bookTitle = new Map((books.data ?? []).map((b) => [b.id, b.title]));
  const authorName = new Map((profiles.data ?? []).map((p) => [p.id, p.nickname ?? p.username ?? "—"]));
  const subById = new Map((subs ?? []).map((s) => [s.id, s]));
  return {
    run,
    rows: rows.map((r) => {
      const s = subById.get(r.submission_id);
      return {
        ...r,
        book_title: s ? (bookTitle.get(s.book_id) ?? "—") : "—",
        author_name: s ? (authorName.get(s.author_id) ?? "—") : "—",
      };
    }),
  };
}

// ---------------------------------------------------------------------
// Slice 2.6b — công bố, đề xuất giải
// ---------------------------------------------------------------------

/**
 * Công bố 1 lượt tính CHÍNH THỨC làm kết quả. Đã có lượt công bố → cần lý
 * do; lượt cũ giữ lại (đánh dấu thay thế). DB kiểm version cấu hình.
 */
export async function publishScoreRun(
  client: Client,
  input: { contestId: string; runId: string; adminId: string; reason: string | null }
): Promise<ScoreRunRow> {
  const { data: run, error } = await client.from("contest_score_runs").select("id").eq("id", input.runId).eq("contest_id", input.contestId).maybeSingle();
  throwIfError(error, "load score run");
  if (!run) throw new ContestError("score_run_not_found");
  const { data, error: pubError } = await client.rpc("publish_contest_score_run", {
    p_run_id: input.runId,
    p_admin_id: input.adminId,
    p_reason: input.reason,
  });
  throwIfError(pubError, "publish_contest_score_run");
  return data as ScoreRunRow;
}

/** Lượt đang công bố (null = chưa có). */
export async function getPublishedRun(client: Client, contestId: string): Promise<ScoreRunRow | null> {
  const { data, error } = await client
    .from("contest_score_runs").select("*").eq("contest_id", contestId).not("published_at", "is", null).is("superseded_at", null).maybeSingle();
  throwIfError(error, "load published run");
  return data;
}

export type AwardProposal = {
  submission_id: string;
  book_title: string;
  author_name: string;
  rank: number;
  code: string;
  name: string;
  kind: "main" | "special";
  /** Theo contests.prizes_summary (khớp tên giải); 0 nếu không khớp — admin sửa trước khi xác nhận. */
  prize_vnd: number;
  prize_extras: string | null;
  /** Đã có contest_awards cùng mã + bài (đã xác nhận). */
  confirmed: boolean;
};

/** J10: đề xuất giải từ lượt ĐANG CÔNG BỐ — admin xác nhận từng giải thành contest_awards. */
export async function getAwardProposals(client: Client, contest: ContestRow): Promise<{ run: ScoreRunRow | null; proposals: AwardProposal[] }> {
  const run = await getPublishedRun(client, contest.id);
  if (!run) return { run: null, proposals: [] };
  const [detail, awards] = await Promise.all([
    getScoreRun(client, contest.id, run.id),
    client.from("contest_awards").select("submission_id, award_code").eq("contest_id", contest.id),
  ]);
  throwIfError(awards.error, "load awards for proposals");
  const done = new Set((awards.data ?? []).map((a) => `${a.award_code}:${a.submission_id}`));
  const prizes = Array.isArray(contest.prizes_summary) ? (contest.prizes_summary as { name?: unknown; amount_vnd?: unknown; extra?: unknown }[]) : [];
  const norm = (s: string) => s.trim().toLocaleLowerCase("vi-VN");
  const prizeFor = (name: string) => prizes.find((p) => typeof p.name === "string" && norm(p.name) === norm(name));
  return {
    run,
    proposals: detail.rows.flatMap((r) =>
      r.awards.map((a) => {
        const prize = prizeFor(a.name);
        return {
          submission_id: r.submission_id,
          book_title: r.book_title,
          author_name: r.author_name,
          rank: r.rank,
          code: a.code,
          name: a.name,
          kind: a.kind,
          prize_vnd: typeof prize?.amount_vnd === "number" ? prize.amount_vnd : 0,
          prize_extras: typeof prize?.extra === "string" && prize.extra.trim() ? prize.extra.trim() : null,
          confirmed: done.has(`${a.code}:${r.submission_id}`),
        };
      })
    ),
  };
}
