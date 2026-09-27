/**
 * Điều chỉnh độ tin cậy trước khi chuẩn hoá (J3 — XXI.12). Thuần, tất định,
 * không bao giờ trả NaN / chia 0.
 */
import type { DepthAggregation, RateAdjustment } from "@/lib/contests/final-scoring/config";

export type RateObservation = { successes: number; observations: number };

const nonNeg = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0);

/** Tỷ lệ gộp của cohort: Σ thành công / Σ quan sát (0 khi không có quan sát). */
export function pooledRate(items: RateObservation[]): number {
  const s = items.reduce((n, x) => n + nonNeg(x.successes), 0);
  const o = items.reduce((n, x) => n + nonNeg(x.observations), 0);
  return o > 0 ? s / o : 0;
}

export function rawRate(x: RateObservation): number {
  const o = nonNeg(x.observations);
  return o > 0 ? Math.min(nonNeg(x.successes) / o, 1) : 0;
}

/**
 * Bayesian: (thành công + C × m) / (quan sát + C). Không có quan sát → m
 * (khi C > 0) — bài chưa có dữ liệu nhận mức chung, không được lợi / thiệt
 * vì mẫu 0. C = 0 hoặc "none" → tỷ lệ thô.
 */
export function adjustRate(x: RateObservation, priorMean: number, adjustment: RateAdjustment): number {
  const s = nonNeg(x.successes);
  const o = nonNeg(x.observations);
  if (adjustment.type === "none" || adjustment.prior_strength <= 0) return o > 0 ? Math.min(s / o, 1) : 0;
  const c = adjustment.prior_strength;
  return Math.min((s + c * nonNeg(priorMean)) / (o + c), 1);
}

export function median(values: number[]): number | null {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

export function mean(values: number[]): number | null {
  const xs = values.filter((v) => Number.isFinite(v));
  return xs.length ? xs.reduce((n, v) => n + v, 0) / xs.length : null;
}

export function aggregate(values: number[], how: DepthAggregation): number | null {
  return how === "median" ? median(values) : mean(values);
}

/**
 * Reading depth của 1 bài: tổng hợp depth từng độc giả (0–1) rồi co về mức
 * chung m khi ít người đọc: (n × agg + C × m) / (n + C). Không có độc giả →
 * m (C > 0) hoặc 0.
 */
export function adjustDepth(readerDepths: number[], contestLevel: number, how: DepthAggregation, adjustment: RateAdjustment): number {
  const depths = readerDepths.map((d) => Math.min(nonNeg(d), 1));
  const n = depths.length;
  const agg = aggregate(depths, how) ?? 0;
  if (adjustment.type === "none" || adjustment.prior_strength <= 0) return n > 0 ? agg : 0;
  const c = adjustment.prior_strength;
  return Math.min((n * agg + c * Math.min(nonNeg(contestLevel), 1)) / (n + c), 1);
}
