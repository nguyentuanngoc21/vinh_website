import { describe, expect, it } from "vitest";
import { growthLabel, pickHiddenGems, seededRandom, trendingGrowth } from "./signals";

const items = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => ({ submission_id: `${prefix}${i}` }));

describe("pickHiddenGems (P5)", () => {
  it("khoảng 80% ô lấy từ nhóm ít độc giả khi cả 2 nhóm đủ bài", () => {
    let fromLow = 0;
    let total = 0;
    for (let s = 0; s < 200; s++) {
      const picked = pickHiddenGems(items("r", 20), items("v", 20), { seed: `s${s}` });
      total += picked.length;
      fromLow += picked.filter((p) => p.submission_id.startsWith("r")).length;
    }
    expect(total).toBe(2000);
    expect(fromLow / total).toBeGreaterThan(0.75);
    expect(fromLow / total).toBeLessThan(0.85);
  });

  it("nhóm trống thì lấy hết từ nhóm còn lại", () => {
    expect(pickHiddenGems([], items("v", 5), { seed: "x" })).toHaveLength(5);
    expect(pickHiddenGems(items("r", 4), [], { seed: "x" })).toHaveLength(4);
    expect(pickHiddenGems([], [], { seed: "x" })).toEqual([]);
  });

  it("bài nằm ở cả 2 nhóm chỉ xuất hiện 1 lần", () => {
    const shared = items("a", 3);
    const picked = pickHiddenGems(shared, shared, { seed: "x" });
    expect(picked.map((p) => p.submission_id).sort()).toEqual(["a0", "a1", "a2"]);
  });

  it("không vượt số thẻ tối đa và giữ thứ tự xáo của từng nhóm", () => {
    const picked = pickHiddenGems(items("r", 30), [], { seed: "x", count: 10 });
    expect(picked.map((p) => p.submission_id)).toEqual(items("r", 10).map((p) => p.submission_id));
  });

  it("cùng seed → cùng kết quả", () => {
    const a = pickHiddenGems(items("r", 20), items("v", 20), { seed: "2026-09-26:u1" });
    const b = pickHiddenGems(items("r", 20), items("v", 20), { seed: "2026-09-26:u1" });
    expect(a).toEqual(b);
  });

  it("seededRandom trả số trong [0, 1)", () => {
    const r = seededRandom("abc");
    for (let i = 0; i < 1000; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe("trendingGrowth (P4)", () => {
  it.each([
    [0, 0, null],
    [0, 5, null],
    [3, 0, { kind: "new" }],
    [5, 5, null],
    [4, 5, null],
    [25, 8, { kind: "percent", value: 213 }],
    [2, 1, { kind: "percent", value: 100 }],
  ])("%i so với %i", (d7, prev, expected) => {
    expect(trendingGrowth(d7, prev)).toEqual(expected);
  });

  it("nhãn chip", () => {
    expect(growthLabel({ kind: "new" })).toBe("Mới");
    expect(growthLabel({ kind: "percent", value: 1250 })).toBe("+1.250%");
    expect(growthLabel(null)).toBeNull();
  });
});
