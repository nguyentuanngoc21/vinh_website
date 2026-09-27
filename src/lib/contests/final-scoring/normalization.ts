/**
 * Chiến lược chuẩn hoá điểm thành phần (J3 — docs/CONTEST_ENGINE_AUDIT_AND_PLAN.md
 * XXI.12). Mọi chiến lược nhận CẢ cohort (chỉ bài hợp lệ — engine lọc trước)
 * và trả điểm [0, 100] cùng thứ tự. Thuần, tất định, không bao giờ trả NaN.
 *
 *   none              giá trị đã ở thang 100 (điểm BGK) — chỉ kẹp vào [0, 100]
 *   absolute          v × 100 (tỷ lệ 0–1)
 *   relative_max      100 × v / max; max ≤ 0 → mọi bài 0
 *   log_relative_max  100 × ln(1+v) / ln(1+max); max ≤ 0 → mọi bài 0
 *   percentile        hạng giữa: 100 × (số bài thấp hơn + ½ số bài bằng (trừ chính nó)) / (n − 1);
 *                     1 bài → 100 nếu > 0; mọi bài 0 → 0
 *   reference_value   100 × min(v / reference, 1)
 */
export const NORMALIZATION_TYPES = ["none", "absolute", "relative_max", "log_relative_max", "percentile", "reference_value"] as const;
export type NormalizationType = (typeof NORMALIZATION_TYPES)[number];

export type NormalizationStrategy =
  | { type: "none" }
  | { type: "absolute" }
  | { type: "relative_max" }
  | { type: "log_relative_max" }
  | { type: "percentile" }
  | { type: "reference_value"; reference: number };

const clamp100 = (x: number): number => (Number.isFinite(x) ? Math.min(100, Math.max(0, x)) : 0);
const safe = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0);

export function normalizeCohort(values: number[], strategy: NormalizationStrategy): number[] {
  const xs = values.map(safe);
  switch (strategy.type) {
    case "none":
      return values.map((v) => clamp100(Number.isFinite(v) ? v : 0));
    case "absolute":
      return xs.map((v) => clamp100(v * 100));
    case "relative_max": {
      const max = Math.max(0, ...xs);
      return xs.map((v) => (max > 0 ? clamp100((100 * v) / max) : 0));
    }
    case "log_relative_max": {
      const max = Math.max(0, ...xs);
      const denom = Math.log1p(max);
      return xs.map((v) => (denom > 0 ? clamp100((100 * Math.log1p(v)) / denom) : 0));
    }
    case "percentile": {
      if (xs.every((v) => v === 0)) return xs.map(() => 0);
      const n = xs.length;
      if (n === 1) return [100];
      return xs.map((v) => {
        const below = xs.filter((x) => x < v).length;
        const equalOthers = xs.filter((x) => x === v).length - 1;
        return clamp100((100 * (below + equalOthers / 2)) / (n - 1));
      });
    }
    case "reference_value": {
      const ref = strategy.reference;
      return xs.map((v) => (ref > 0 ? clamp100((100 * Math.min(v / ref, 1))) : 0));
    }
  }
}
