import { describe, expect, it } from "vitest";
import { parseGoal, summarize } from "./writing-goal";

describe("parseGoal", () => {
  it("accepts integers in range, null/0 to clear", () => {
    expect(parseGoal(1000)).toBe(1000);
    expect(parseGoal(0)).toBeNull();
    expect(parseGoal(null)).toBeNull();
    for (const bad of [49, 50001, 1.5, "1000", undefined]) expect(parseGoal(bad)).toBe("invalid");
  });
});

describe("summarize", () => {
  const rows = [
    { day: "2026-10-05", words: 1200 }, { day: "2026-10-06", words: 300 },
    { day: "2026-10-07", words: 1000 }, { day: "2026-10-08", words: 1500 }, { day: "2026-10-09", words: 200 },
  ];
  it("counts the streak up to yesterday while today is unmet", () => {
    expect(summarize(rows, 1000, "2026-10-09")).toMatchObject({ today: 200, streak: 2 });
  });
  it("includes today once reached and stops at a missed day", () => {
    expect(summarize([...rows.slice(0, 4), { day: "2026-10-09", words: 1000 }], 1000, "2026-10-09").streak).toBe(3);
  });
  it("has no streak without a goal and always returns 7 days ending today", () => {
    const s = summarize(rows, null, "2026-10-09");
    expect(s.streak).toBe(0);
    expect(s.last7.map(d => d.day)).toEqual(["2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"]);
    expect(s.last7[6].words).toBe(200);
  });
  it("computes 30-day and month statistics", () => {
    const s = summarize([...rows, { day: "2026-09-20", words: 5000 }, { day: "2026-08-01", words: 9000 }], 1000, "2026-10-09");
    expect(s.last30).toHaveLength(30);
    expect(s.stats).toEqual({ month: 4200, total30: 9200, activeDays30: 6, avgActive30: 1533, best: { day: "2026-08-01", words: 9000 } });
  });
});
