import { describe, expect, it } from "vitest";
import { normalizeCohort } from "./normalization";
import { adjustDepth, adjustRate, median, pooledRate, rawRate } from "./adjustment";

describe("normalizeCohort (J3)", () => {
  it("relative_max: tốt nhất = 100, tỷ lệ theo bài tốt nhất", () => {
    expect(normalizeCohort([0.25, 0.125, 0], { type: "relative_max" })).toEqual([100, 50, 0]);
  });

  it("relative_max / log_relative_max: max = 0 → mọi bài 0, không NaN, không tự cho 100", () => {
    expect(normalizeCohort([0, 0, 0], { type: "relative_max" })).toEqual([0, 0, 0]);
    expect(normalizeCohort([0, 0], { type: "log_relative_max" })).toEqual([0, 0]);
    expect(normalizeCohort([], { type: "relative_max" })).toEqual([]);
  });

  it("log_relative_max = 100 × ln(1+R) / ln(1+R_max): 1000 độc giả không gấp 10 lần 100", () => {
    const [a, b] = normalizeCohort([1000, 100], { type: "log_relative_max" });
    expect(a).toBe(100);
    expect(b).toBeCloseTo((100 * Math.log(101)) / Math.log(1001), 10);
    expect(b).toBeGreaterThan(60);
  });

  it("absolute = rate × 100, kẹp [0, 100]", () => {
    expect(normalizeCohort([0.25, 1.5, -1], { type: "absolute" })).toEqual([25, 100, 0]);
  });

  it("none giữ nguyên thang 100 (điểm BGK 80 không thành 100)", () => {
    expect(normalizeCohort([80, 60], { type: "none" })).toEqual([80, 60]);
  });

  it("reference_value = 100 × min(v / ref, 1)", () => {
    const r = normalizeCohort([0.05, 0.15, 0.25, 0.4], { type: "reference_value", reference: 0.3 });
    expect(r[0]).toBeCloseTo(16.667, 2);
    expect(r[1]).toBeCloseTo(50, 10);
    expect(r[2]).toBeCloseTo(83.333, 2);
    expect(r[3]).toBe(100);
  });

  it("percentile: hạng giữa, đồng giá trị cùng điểm", () => {
    expect(normalizeCohort([10, 20, 20, 30], { type: "percentile" })).toEqual([0, 50, 50, 100]);
    expect(normalizeCohort([0, 0], { type: "percentile" })).toEqual([0, 0]);
    expect(normalizeCohort([5], { type: "percentile" })).toEqual([100]);
  });

  it("NaN / Infinity đầu vào → 0", () => {
    expect(normalizeCohort([NaN, Infinity, 2], { type: "relative_max" })).toEqual([0, 0, 100]);
  });
});

describe("Bayesian (đặc tả mục 10)", () => {
  it("5/5 không tự thắng 400/1000 khi C đủ lớn", () => {
    const items = [{ successes: 5, observations: 5 }, { successes: 400, observations: 1000 }];
    const m = pooledRate(items);
    const a = adjustRate(items[0], m, { type: "bayesian", prior_strength: 20 });
    const b = adjustRate(items[1], m, { type: "bayesian", prior_strength: 20 });
    expect(rawRate(items[0])).toBe(1);
    expect(a).toBeLessThan(0.6);
    expect(b).toBeCloseTo(0.4, 2);
  });

  it("mẫu số 0 → mức chung m (C > 0), hoặc 0 khi không điều chỉnh", () => {
    expect(adjustRate({ successes: 0, observations: 0 }, 0.3, { type: "bayesian", prior_strength: 20 })).toBeCloseTo(0.3, 10);
    expect(adjustRate({ successes: 0, observations: 0 }, 0.3, { type: "none" })).toBe(0);
    expect(pooledRate([{ successes: 0, observations: 0 }])).toBe(0);
  });
});

describe("Reading depth", () => {
  it("trung vị chống outlier", () => {
    expect(median([0.1, 0.2, 0.9])).toBe(0.2);
    expect(median([0.2, 0.4])).toBeCloseTo(0.3, 10);
    expect(median([])).toBeNull();
  });

  it("ít người đọc → co về mức chung; nhiều người đọc → gần trung vị của bài", () => {
    const few = adjustDepth([1], 0.5, "median", { type: "bayesian", prior_strength: 10 });
    const many = adjustDepth(Array(200).fill(0.9), 0.5, "median", { type: "bayesian", prior_strength: 10 });
    expect(few).toBeCloseTo((1 + 10 * 0.5) / 11, 10);
    expect(many).toBeGreaterThan(0.88);
    expect(adjustDepth([], 0.5, "median", { type: "bayesian", prior_strength: 10 })).toBeCloseTo(0.5, 10);
    expect(adjustDepth([], 0.5, "median", { type: "none" })).toBe(0);
  });

  it("depth theo % nội dung — truyện ngắn và dài cùng 80% thì bằng nhau", () => {
    expect(adjustDepth([4000 / 5000], 0, "median", { type: "none" })).toBeCloseTo(adjustDepth([40000 / 50000], 0, "median", { type: "none" }), 10);
  });
});
