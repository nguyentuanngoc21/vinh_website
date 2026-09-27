/**
 * Cấu hình chấm điểm CHUNG CUỘC (Slice 2.5–2.6) — nơi duy nhất định nghĩa
 * hình dạng, mặc định và kiểm hợp lệ. Lưu theo version trong
 * contest_scoring_configs (migrations/20260926_add_contest_judging.sql); mỗi lượt
 * tính điểm ghi version đã dùng. Khác contests.scoring_config (cấu hình khám
 * phá / BXH trong lúc thi — src/lib/contests/config.ts).
 *
 * Pipeline mỗi thành phần (J3 — docs/CONTEST_ENGINE_AUDIT_AND_PLAN.md XXI.12):
 *   raw metric → điều chỉnh độ tin cậy (Bayesian / log / tổng hợp) →
 *   chuẩn hoá (normalization.ts) → điểm thành phần [0, 100] → × trọng số.
 * Mặc định theo đặc tả 26/09 + bản cập nhật chuẩn hoá 27/09/2026 + J4, J8, J9.
 */
import { NORMALIZATION_TYPES, type NormalizationStrategy } from "@/lib/contests/final-scoring/normalization";

export type ScoreComponent = "judge" | "reader" | "reading_quality" | "engagement" | "vote";
export type TieBreakKey = "judge" | "reading_quality" | "reader" | "engagement" | "vote" | "submitted_at";
export type EngagementAction = "comment" | "chapter_vote" | "character_vote" | "reading_list" | "author_follow";

/** Điều chỉnh tỷ lệ cho mẫu nhỏ: (thành công + C × m) / (quan sát + C), m = tỷ lệ gộp toàn cuộc thi. */
export type RateAdjustment = { type: "bayesian"; prior_strength: number } | { type: "none" };
export type DepthAggregation = "median" | "mean";

export type RateComponentConfig = { weight: number; adjustment: RateAdjustment; normalization: NormalizationStrategy };

export type RubricCriterion = { code: string; label: string; max: number };
export type MainAward = { code: string; name: string; positions: number[] };
export type SpecialAward = { code: string; name: string; component: "vote" | "reading_quality" | "engagement" };

export type FinalScoringConfig = {
  components: {
    /** Thang 100 tuyệt đối của rubric — luôn "none" (không kéo điểm BGK cao nhất lên 100). */
    judge: { weight: number; normalization: NormalizationStrategy };
    reader: { weight: number; transformation: "log" | "none"; normalization: NormalizationStrategy };
    reading_quality: {
      weight: number;
      depth: {
        weight: number;
        aggregation: DepthAggregation;
        /** Co giá trị tổng hợp về mức chung của cuộc thi khi ít người đọc (J4: C = 10). */
        adjustment: RateAdjustment;
        normalization: NormalizationStrategy;
      };
      return: RateComponentConfig & { weight: number };
    };
    engagement: RateComponentConfig;
    vote: RateComponentConfig;
  };
  valid_reader: { meaningful_read_ratio: number; meaningful_read_min_seconds: number; reading_words_per_minute: number };
  reading_depth: { max_words_per_minute: number };
  return_visit: { min_gap_minutes: number; min_active_seconds: number };
  engagement_actions: EngagementAction[];
  rubric: RubricCriterion[];
  tie_break: TieBreakKey[];
  main_awards: MainAward[];
  special_awards: { exclude_main_winners: boolean; max_per_submission: number; order: SpecialAward[] };
  /** J5: chỉ công bố khi mọi giám khảo đang gán đã chốt mọi bài. */
  require_all_judges: boolean;
};

const REL: NormalizationStrategy = { type: "relative_max" };

export const DEFAULT_FINAL_SCORING_CONFIG: FinalScoringConfig = {
  components: {
    judge: { weight: 0.5, normalization: { type: "none" } },
    reader: { weight: 0.15, transformation: "log", normalization: REL },
    reading_quality: {
      weight: 0.15,
      depth: { weight: 0.7, aggregation: "median", adjustment: { type: "bayesian", prior_strength: 10 }, normalization: REL },
      return: { weight: 0.3, adjustment: { type: "bayesian", prior_strength: 20 }, normalization: REL },
    },
    engagement: { weight: 0.1, adjustment: { type: "bayesian", prior_strength: 20 }, normalization: REL },
    vote: { weight: 0.1, adjustment: { type: "bayesian", prior_strength: 20 }, normalization: REL },
  },
  valid_reader: { meaningful_read_ratio: 0.4, meaningful_read_min_seconds: 30, reading_words_per_minute: 250 },
  reading_depth: { max_words_per_minute: 600 },
  return_visit: { min_gap_minutes: 360, min_active_seconds: 60 },
  engagement_actions: ["comment", "chapter_vote", "character_vote", "reading_list", "author_follow"],
  rubric: [
    { code: "plot", label: "Cốt truyện & cấu trúc", max: 25 },
    { code: "characters", label: "Nhân vật", max: 20 },
    { code: "style", label: "Văn phong & khả năng kể chuyện", max: 20 },
    { code: "creativity", label: "Tính sáng tạo", max: 15 },
    { code: "theme", label: "Khai thác chủ đề cuộc thi", max: 20 },
  ],
  tie_break: ["judge", "reading_quality", "reader", "submitted_at"],
  main_awards: [
    { code: "first_prize", name: "Giải Nhất", positions: [1] },
    { code: "second_prize", name: "Giải Nhì", positions: [2, 3] },
    { code: "third_prize", name: "Giải Ba", positions: [4, 5, 6] },
  ],
  special_awards: {
    exclude_main_winners: true,
    max_per_submission: 1,
    order: [
      { code: "most_loved", name: "Tác phẩm được yêu thích nhất", component: "vote" },
      { code: "best_retention", name: "Tác phẩm giữ chân độc giả nhất", component: "reading_quality" },
      { code: "most_engaging", name: "Tác phẩm tương tác nổi bật nhất", component: "engagement" },
    ],
  },
  require_all_judges: true,
};

export const SCORE_COMPONENTS: ScoreComponent[] = ["judge", "reader", "reading_quality", "engagement", "vote"];
const TIE_KEYS: TieBreakKey[] = ["judge", "reading_quality", "reader", "engagement", "vote", "submitted_at"];
const ACTIONS: EngagementAction[] = ["comment", "chapter_vote", "character_vote", "reading_list", "author_follow"];
const CODE_RE = /^[a-z0-9_]+$/;
const EPS = 1e-9;

export type ConfigParse = { ok: true; value: FinalScoringConfig } | { ok: false; errors: string[] };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);
const isWeight = (v: unknown): v is number => isNum(v) && v >= 0 && v <= 1;

function checkKeys(obj: Record<string, unknown>, keys: string[], label: string, e: string[]): boolean {
  let ok = true;
  for (const k of Object.keys(obj)) if (!keys.includes(k)) { e.push(`${label}.${k}: khoá không được hỗ trợ`); ok = false; }
  for (const k of keys) if (!(k in obj)) { e.push(`${label}.${k}: bắt buộc`); ok = false; }
  return ok;
}

function checkNormalization(v: unknown, label: string, e: string[], allowed: readonly string[] = NORMALIZATION_TYPES): void {
  if (!isObj(v) || typeof v.type !== "string" || !allowed.includes(v.type)) {
    e.push(`${label}.normalization.type: một trong ${allowed.join(", ")}`);
    return;
  }
  if (v.type === "reference_value") {
    if (!isNum(v.reference) || v.reference <= 0 || Object.keys(v).some((k) => k !== "type" && k !== "reference")) {
      e.push(`${label}.normalization: reference_value cần reference > 0`);
    }
  } else if (Object.keys(v).length !== 1) {
    e.push(`${label}.normalization: ${v.type} không nhận tham số`);
  }
}

function checkAdjustment(v: unknown, label: string, e: string[]): void {
  if (isObj(v) && v.type === "none" && Object.keys(v).length === 1) return;
  if (isObj(v) && v.type === "bayesian" && isNum(v.prior_strength) && v.prior_strength >= 0 && Object.keys(v).length === 2) return;
  e.push(`${label}.adjustment: { type: "none" } hoặc { type: "bayesian", prior_strength ≥ 0 }`);
}

function checkComponents(c: unknown, e: string[]): void {
  if (!isObj(c) || !checkKeys(c, SCORE_COMPONENTS, "components", e)) return;
  const weights: number[] = [];

  const judge = c.judge;
  if (isObj(judge) && checkKeys(judge, ["weight", "normalization"], "components.judge", e)) {
    if (!isWeight(judge.weight)) e.push("components.judge.weight: số trong [0, 1]");
    else weights.push(judge.weight);
    // Đặc tả J3 mục 10: không chuẩn hoá điểm BGK theo điểm cao nhất.
    checkNormalization(judge.normalization, "components.judge", e, ["none"]);
  } else if (!isObj(judge)) e.push("components.judge: bắt buộc");

  const reader = c.reader;
  if (isObj(reader) && checkKeys(reader, ["weight", "transformation", "normalization"], "components.reader", e)) {
    if (!isWeight(reader.weight)) e.push("components.reader.weight: số trong [0, 1]");
    else weights.push(reader.weight);
    if (reader.transformation !== "log" && reader.transformation !== "none") e.push("components.reader.transformation: log | none");
    checkNormalization(reader.normalization, "components.reader", e, NORMALIZATION_TYPES.filter((t) => t !== "none"));
    if (reader.transformation === "log" && isObj(reader.normalization) && reader.normalization.type === "log_relative_max") {
      e.push("components.reader: đã biến đổi log thì dùng relative_max (log_relative_max sẽ log 2 lần)");
    }
  } else if (!isObj(reader)) e.push("components.reader: bắt buộc");

  const rq = c.reading_quality;
  if (isObj(rq) && checkKeys(rq, ["weight", "depth", "return"], "components.reading_quality", e)) {
    if (!isWeight(rq.weight)) e.push("components.reading_quality.weight: số trong [0, 1]");
    else weights.push(rq.weight);
    const depth = rq.depth;
    const ret = rq.return;
    if (isObj(depth) && checkKeys(depth, ["weight", "aggregation", "adjustment", "normalization"], "components.reading_quality.depth", e)) {
      if (!isWeight(depth.weight)) e.push("components.reading_quality.depth.weight: số trong [0, 1]");
      if (depth.aggregation !== "median" && depth.aggregation !== "mean") e.push("components.reading_quality.depth.aggregation: median | mean");
      checkAdjustment(depth.adjustment, "components.reading_quality.depth", e);
      checkNormalization(depth.normalization, "components.reading_quality.depth", e, NORMALIZATION_TYPES.filter((t) => t !== "none"));
    }
    if (isObj(ret) && checkKeys(ret, ["weight", "adjustment", "normalization"], "components.reading_quality.return", e)) {
      if (!isWeight(ret.weight)) e.push("components.reading_quality.return.weight: số trong [0, 1]");
      checkAdjustment(ret.adjustment, "components.reading_quality.return", e);
      checkNormalization(ret.normalization, "components.reading_quality.return", e, NORMALIZATION_TYPES.filter((t) => t !== "none"));
    }
    if (isObj(depth) && isObj(ret) && isWeight(depth.weight) && isWeight(ret.weight) && Math.abs(depth.weight + ret.weight - 1) > EPS) {
      e.push("components.reading_quality: depth.weight + return.weight phải bằng 1");
    }
  } else if (!isObj(rq)) e.push("components.reading_quality: bắt buộc");

  for (const k of ["engagement", "vote"] as const) {
    const comp = c[k];
    if (isObj(comp) && checkKeys(comp, ["weight", "adjustment", "normalization"], `components.${k}`, e)) {
      if (!isWeight(comp.weight)) e.push(`components.${k}.weight: số trong [0, 1]`);
      else weights.push(comp.weight);
      checkAdjustment(comp.adjustment, `components.${k}`, e);
      checkNormalization(comp.normalization, `components.${k}`, e, NORMALIZATION_TYPES.filter((t) => t !== "none"));
    } else if (!isObj(comp)) e.push(`components.${k}: bắt buộc`);
  }

  if (weights.length === SCORE_COMPONENTS.length && Math.abs(weights.reduce((n, w) => n + w, 0) - 1) > EPS) {
    e.push("components: tổng trọng số 5 thành phần phải bằng 1");
  }
}

/**
 * Kiểm cấu hình ĐẦY ĐỦ (không gộp mặc định ngầm — mỗi version phải tự đủ để
 * tính lại ra đúng kết quả). Admin form gửi cả object; mặc định chỉ dùng làm
 * điểm xuất phát của form.
 */
export function parseFinalScoringConfig(input: unknown): ConfigParse {
  const e: string[] = [];
  if (!isObj(input)) return { ok: false, errors: ["Cấu hình phải là object"] };
  if (!checkKeys(input, Object.keys(DEFAULT_FINAL_SCORING_CONFIG), "config", e)) return { ok: false, errors: e };
  const c = input;

  checkComponents(c.components, e);

  const vr = c.valid_reader;
  if (!isObj(vr) || !isNum(vr.meaningful_read_ratio) || vr.meaningful_read_ratio <= 0 || vr.meaningful_read_ratio > 1
    || !isInt(vr.meaningful_read_min_seconds) || vr.meaningful_read_min_seconds < 0
    || !isInt(vr.reading_words_per_minute) || vr.reading_words_per_minute < 50) {
    e.push("valid_reader: meaningful_read_ratio (0, 1], meaningful_read_min_seconds ≥ 0, reading_words_per_minute ≥ 50");
  }

  const rd = c.reading_depth;
  if (!isObj(rd) || !isInt(rd.max_words_per_minute) || rd.max_words_per_minute < 50) e.push("reading_depth.max_words_per_minute: số nguyên ≥ 50");

  const rv = c.return_visit;
  if (!isObj(rv) || !isInt(rv.min_gap_minutes) || rv.min_gap_minutes < 1 || !isInt(rv.min_active_seconds) || rv.min_active_seconds < 0) {
    e.push("return_visit: min_gap_minutes ≥ 1, min_active_seconds ≥ 0 (số nguyên)");
  }

  const acts = c.engagement_actions;
  if (!Array.isArray(acts) || acts.length === 0 || acts.some((a) => !ACTIONS.includes(a)) || new Set(acts).size !== acts.length) {
    e.push(`engagement_actions: danh sách không trùng trong ${ACTIONS.join(", ")}`);
  }

  const rubric = c.rubric;
  if (!Array.isArray(rubric) || rubric.length === 0
    || rubric.some((r) => !isObj(r) || typeof r.code !== "string" || !CODE_RE.test(r.code) || typeof r.label !== "string" || r.label.trim() === "" || !isNum(r.max) || r.max <= 0)
    || new Set(rubric.map((r) => (r as RubricCriterion).code)).size !== rubric.length) {
    e.push("rubric: mỗi tiêu chí có code (a-z0-9_) không trùng, label, max > 0");
  } else if (Math.abs(rubric.reduce((n, r) => n + (r as RubricCriterion).max, 0) - 100) > EPS) {
    e.push("rubric: tổng điểm tối đa các tiêu chí phải bằng 100");
  }

  const tb = c.tie_break;
  if (!Array.isArray(tb) || tb.length === 0 || tb.some((k) => !TIE_KEYS.includes(k)) || new Set(tb).size !== tb.length) {
    e.push(`tie_break: danh sách không trùng trong ${TIE_KEYS.join(", ")}`);
  }

  const ma = c.main_awards;
  const seenPos = new Set<number>();
  if (!Array.isArray(ma) || ma.some((a) => !isObj(a) || typeof a.code !== "string" || !CODE_RE.test(a.code) || typeof a.name !== "string"
    || a.name.trim() === "" || !Array.isArray(a.positions) || a.positions.length === 0
    || a.positions.some((p) => !isInt(p) || p < 1 || seenPos.has(p) || !seenPos.add(p)))) {
    e.push("main_awards: mỗi giải có code, name, positions (hạng ≥ 1, không trùng giữa các giải)");
  }

  const sa = c.special_awards;
  if (!isObj(sa) || typeof sa.exclude_main_winners !== "boolean" || !isInt(sa.max_per_submission) || sa.max_per_submission < 1
    || !Array.isArray(sa.order) || sa.order.some((a) => !isObj(a) || typeof a.code !== "string" || !CODE_RE.test(a.code)
      || typeof a.name !== "string" || a.name.trim() === "" || !["reading_quality", "engagement", "vote"].includes(a.component as string))) {
    e.push("special_awards: exclude_main_winners, max_per_submission ≥ 1, order (code, name, component vote | reading_quality | engagement)");
  }

  if (typeof c.require_all_judges !== "boolean") e.push("require_all_judges: true/false");

  if (Array.isArray(ma) && isObj(sa) && Array.isArray(sa.order)) {
    const codes = [...ma, ...sa.order].map((a) => (isObj(a) ? a.code : null));
    if (new Set(codes).size !== codes.length) e.push("Mã giải (main_awards + special_awards) không được trùng");
  }

  return e.length ? { ok: false, errors: e } : { ok: true, value: input as FinalScoringConfig };
}

/** Tổng điểm của một phiếu chấm theo rubric (bỏ tiêu chí lạ). Dùng cho form (SQL kiểm lại). */
export function rubricTotal(rubric: RubricCriterion[], scores: Record<string, number | null | undefined>): number {
  return rubric.reduce((n, r) => n + (typeof scores[r.code] === "number" ? (scores[r.code] as number) : 0), 0);
}
