/**
 * Engine tính điểm chung cuộc (Slice 2.6a) — THUẦN, tất định: cùng số liệu
 * thô + cùng config version → cùng kết quả (không đọc thời gian thực, không
 * random; thứ tự cuối cùng theo submission_id).
 *
 * Pipeline mỗi thành phần (J3 — docs/CONTEST_ENGINE_AUDIT_AND_PLAN.md XXI.12):
 *   số liệu thô → điều chỉnh (log / Bayesian / tổng hợp depth) → chuẩn hoá
 *   trên cohort (chỉ bài hợp lệ) → điểm [0, 100] → × trọng số.
 * Sau đó: xếp hạng (FinalScore giảm dần + chuỗi phá hoà J8) → đề xuất giải
 * chính + giải đặc biệt (J9). Admin xác nhận giải ở Slice 2.6b (J10).
 */
import type { FinalScoringConfig, TieBreakKey } from "@/lib/contests/final-scoring/config";
import { adjustDepth, adjustRate, aggregate, pooledRate, rawRate } from "@/lib/contests/final-scoring/adjustment";
import { normalizeCohort } from "@/lib/contests/final-scoring/normalization";

/** 1 dòng / bài hợp lệ, từ get_contest_scoring_metrics(). */
export type SubmissionMetrics = {
  submission_id: string;
  submitted_at: string;
  has_snapshot: boolean;
  valid_readers: number;
  /** Depth (0–1) của từng valid reader. */
  reader_depths: number[];
  returning_readers: number;
  engaged_readers: number;
  valid_votes: number;
  /** Tổng điểm các phiếu ĐÃ CHỐT của giám khảo đang gán. */
  judge_totals: number[];
  active_judges: number;
};

export type ScoredRow = {
  submission_id: string;
  submitted_at: string;
  rank: number;
  tied: boolean;
  valid_readers: number;
  reader_transformed: number;
  reader_score: number;
  reader_depth_count: number;
  aggregated_depth: number;
  adjusted_depth: number;
  depth_score: number;
  returning_readers: number;
  raw_return_rate: number;
  adjusted_return_rate: number;
  return_score: number;
  reading_quality_score: number;
  engaged_readers: number;
  raw_engagement_rate: number;
  adjusted_engagement_rate: number;
  engagement_score: number;
  valid_votes: number;
  raw_vote_rate: number;
  adjusted_vote_rate: number;
  vote_score: number;
  judge_count: number;
  /** null = chưa có phiếu chốt (tính như 0 vào FinalScore và gắn cờ). */
  judge_score: number | null;
  system_score: number;
  final_score: number;
  /** Giải đề xuất (chính trước, đặc biệt sau) — admin xác nhận ở Slice 2.6b. */
  awards: { code: string; name: string; kind: "main" | "special" }[];
};

export type EngineFlag =
  | { code: "no_submissions" }
  | { code: "single_submission" }
  | { code: "no_active_judges" }
  | { code: "judging_incomplete"; submission_ids: string[] }
  | { code: "snapshot_missing"; submission_ids: string[] }
  | { code: "award_tie"; award_code: string; submission_ids: string[] }
  | { code: "award_unassigned"; award_code: string };

export type EngineResult = { rows: ScoredRow[]; flags: EngineFlag[]; judging_complete: boolean };

/** Làm tròn để so sánh / lưu — tránh nhiễu dấu phẩy động tạo "không đồng hạng" giả. */
const r6 = (x: number): number => Math.round(x * 1e6) / 1e6;

function tieValue(row: ScoredRow, key: TieBreakKey): number {
  switch (key) {
    case "judge":
      return row.judge_score ?? 0;
    case "reading_quality":
      return row.reading_quality_score;
    case "reader":
      return row.reader_score;
    case "engagement":
      return row.engagement_score;
    case "vote":
      return row.vote_score;
    case "submitted_at":
      // Nộp sớm hơn thắng → giá trị lớn hơn khi thời điểm nhỏ hơn.
      return -Date.parse(row.submitted_at);
  }
}

/** So sánh theo FinalScore rồi chuỗi phá hoà; 0 = đồng hạng thật. */
function compareByScore(a: ScoredRow, b: ScoredRow, keys: TieBreakKey[], primary: (r: ScoredRow) => number): number {
  const d = primary(b) - primary(a);
  if (d !== 0) return d;
  for (const k of keys) {
    const x = tieValue(b, k) - tieValue(a, k);
    if (x !== 0) return x;
  }
  return 0;
}

export function computeFinalScores(config: FinalScoringConfig, metrics: SubmissionMetrics[]): EngineResult {
  const flags: EngineFlag[] = [];
  if (metrics.length === 0) return { rows: [], flags: [{ code: "no_submissions" }], judging_complete: false };
  if (metrics.length === 1) flags.push({ code: "single_submission" });
  const c = config.components;
  const cohort = [...metrics].sort((a, b) => (a.submission_id < b.submission_id ? -1 : a.submission_id > b.submission_id ? 1 : 0));

  // Reader: log(1 + R) → chuẩn hoá.
  const readerT = cohort.map((m) => (c.reader.transformation === "log" ? Math.log1p(Math.max(0, m.valid_readers)) : Math.max(0, m.valid_readers)));
  const readerScores = normalizeCohort(readerT, c.reader.normalization);

  // Depth: tổng hợp từng bài, co về mức chung (tổng hợp mọi độc giả cohort) → chuẩn hoá.
  const depthCfg = c.reading_quality.depth;
  const contestDepth = aggregate(cohort.flatMap((m) => m.reader_depths), depthCfg.aggregation) ?? 0;
  const aggDepth = cohort.map((m) => aggregate(m.reader_depths, depthCfg.aggregation) ?? 0);
  const adjDepth = cohort.map((m) => adjustDepth(m.reader_depths, contestDepth, depthCfg.aggregation, depthCfg.adjustment));
  const depthScores = normalizeCohort(adjDepth, depthCfg.normalization);

  const rateLayer = (successes: (m: SubmissionMetrics) => number, cfg: { adjustment: FinalScoringConfig["components"]["vote"]["adjustment"]; normalization: FinalScoringConfig["components"]["vote"]["normalization"] }) => {
    const obs = cohort.map((m) => ({ successes: successes(m), observations: m.valid_readers }));
    const prior = pooledRate(obs);
    const raw = obs.map(rawRate);
    const adjusted = obs.map((o) => adjustRate(o, prior, cfg.adjustment));
    return { raw, adjusted, scores: normalizeCohort(adjusted, cfg.normalization) };
  };
  const ret = rateLayer((m) => m.returning_readers, c.reading_quality.return);
  const eng = rateLayer((m) => m.engaged_readers, c.engagement);
  const vote = rateLayer((m) => m.valid_votes, c.vote);

  const activeJudges = Math.max(0, ...cohort.map((m) => m.active_judges));
  if (activeJudges === 0) flags.push({ code: "no_active_judges" });
  const incomplete = cohort.filter((m) => m.judge_totals.length < activeJudges || m.judge_totals.length === 0).map((m) => m.submission_id);
  if (incomplete.length) flags.push({ code: "judging_incomplete", submission_ids: incomplete });
  const noSnapshot = cohort.filter((m) => !m.has_snapshot).map((m) => m.submission_id);
  if (noSnapshot.length) flags.push({ code: "snapshot_missing", submission_ids: noSnapshot });

  const systemWeight = c.reader.weight + c.reading_quality.weight + c.engagement.weight + c.vote.weight;

  const rows: ScoredRow[] = cohort.map((m, i) => {
    const rq = depthCfg.weight * depthScores[i] + c.reading_quality.return.weight * ret.scores[i];
    const judgeRaw = m.judge_totals.length ? m.judge_totals.reduce((n, t) => n + t, 0) / m.judge_totals.length : null;
    const judge = judgeRaw === null ? null : normalizeCohort([judgeRaw], c.judge.normalization)[0];
    const systemSum = c.reader.weight * readerScores[i] + c.reading_quality.weight * rq + c.engagement.weight * eng.scores[i] + c.vote.weight * vote.scores[i];
    return {
      submission_id: m.submission_id,
      submitted_at: m.submitted_at,
      rank: 0,
      tied: false,
      valid_readers: m.valid_readers,
      reader_transformed: r6(readerT[i]),
      reader_score: r6(readerScores[i]),
      reader_depth_count: m.reader_depths.length,
      aggregated_depth: r6(aggDepth[i]),
      adjusted_depth: r6(adjDepth[i]),
      depth_score: r6(depthScores[i]),
      returning_readers: m.returning_readers,
      raw_return_rate: r6(ret.raw[i]),
      adjusted_return_rate: r6(ret.adjusted[i]),
      return_score: r6(ret.scores[i]),
      reading_quality_score: r6(rq),
      engaged_readers: m.engaged_readers,
      raw_engagement_rate: r6(eng.raw[i]),
      adjusted_engagement_rate: r6(eng.adjusted[i]),
      engagement_score: r6(eng.scores[i]),
      valid_votes: m.valid_votes,
      raw_vote_rate: r6(vote.raw[i]),
      adjusted_vote_rate: r6(vote.adjusted[i]),
      vote_score: r6(vote.scores[i]),
      judge_count: m.judge_totals.length,
      judge_score: judge === null ? null : r6(judge),
      system_score: r6(systemWeight > 0 ? systemSum / systemWeight : 0),
      final_score: r6(c.judge.weight * (judge ?? 0) + systemSum),
      awards: [],
    };
  });

  // Xếp hạng: FinalScore ↓ → chuỗi phá hoà (J8) → submission_id (chỉ để thứ tự tất định; không phá hoà).
  const keys = config.tie_break;
  rows.sort((a, b) => compareByScore(a, b, keys, (r) => r.final_score) || (a.submission_id < b.submission_id ? -1 : 1));
  rows.forEach((row, i) => {
    const prev = rows[i - 1];
    row.rank = prev && compareByScore(prev, row, keys, (r) => r.final_score) === 0 ? prev.rank : i + 1;
  });
  for (const row of rows) row.tied = rows.some((o) => o !== row && o.rank === row.rank);

  assignAwards(config, rows, flags);
  return { rows, flags, judging_complete: activeJudges > 0 && incomplete.length === 0 };
}

function assignAwards(config: FinalScoringConfig, rows: ScoredRow[], flags: EngineFlag[]): void {
  const keys = config.tie_break;
  // Giải chính theo hạng (J9: #1 Nhất, #2–3 Nhì, #4–6 Ba). Đồng hạng thật vắt qua ranh giới giải → cờ, admin quyết.
  for (const award of config.main_awards) {
    for (const pos of award.positions) {
      const row = rows[pos - 1];
      if (row) row.awards.push({ code: award.code, name: award.name, kind: "main" });
    }
    const maxPos = Math.max(...award.positions);
    const boundary = rows[maxPos - 1];
    const next = rows[maxPos];
    if (boundary && next && boundary.rank === next.rank) {
      flags.push({ code: "award_tie", award_code: award.code, submission_ids: rows.filter((r) => r.rank === boundary.rank).map((r) => r.submission_id) });
    }
  }

  const special = config.special_awards;
  const count = new Map<string, number>();
  const component = (r: ScoredRow, k: "vote" | "reading_quality" | "engagement") =>
    k === "vote" ? r.vote_score : k === "reading_quality" ? r.reading_quality_score : r.engagement_score;
  for (const award of special.order) {
    const pool = rows.filter(
      (r) => (!special.exclude_main_winners || !r.awards.some((a) => a.kind === "main")) && (count.get(r.submission_id) ?? 0) < special.max_per_submission
    );
    const sorted = [...pool].sort(
      (a, b) => compareByScore(a, b, keys, (r) => component(r, award.component)) || (a.submission_id < b.submission_id ? -1 : 1)
    );
    const best = sorted[0];
    if (!best || component(best, award.component) <= 0) {
      flags.push({ code: "award_unassigned", award_code: award.code });
      continue;
    }
    const runnerUp = sorted[1];
    if (runnerUp && compareByScore(best, runnerUp, keys, (r) => component(r, award.component)) === 0) {
      flags.push({ code: "award_tie", award_code: award.code, submission_ids: [best.submission_id, runnerUp.submission_id] });
    }
    best.awards.push({ code: award.code, name: award.name, kind: "special" });
    count.set(best.submission_id, (count.get(best.submission_id) ?? 0) + 1);
  }
}
