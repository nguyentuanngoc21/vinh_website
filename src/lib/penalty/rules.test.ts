import { describe, expect, it } from "vitest";
import {
  getAppliedPenaltyRule,
  getNextPenalty,
  getPenaltyDeduction,
  PENALTY_BASE_TOKEN,
  PENALTY_RULES,
} from "./rules";

describe("PENALTY_RULES", () => {
  it("giữ nguyên 4 mốc phạt thật", () => {
    expect(PENALTY_RULES).toEqual([
      { percent: 10, durationDays: 3 },
      { percent: 10, durationDays: 7 },
      { percent: 15, durationDays: 14 },
      { percent: 15, durationDays: 30 },
    ]);
    expect(PENALTY_BASE_TOKEN).toBe(1000);
  });
});

describe("getNextPenalty", () => {
  it("lần vi phạm đầu (count=0) chỉ cảnh báo", () => {
    expect(getNextPenalty(0)).toEqual({ warning: true });
  });

  it("count 1..4 áp PENALTY_RULES[count-1]", () => {
    expect(getNextPenalty(1)).toEqual({ percent: 10, durationDays: 3 });
    expect(getNextPenalty(2)).toEqual({ percent: 10, durationDays: 7 });
    expect(getNextPenalty(3)).toEqual({ percent: 15, durationDays: 14 });
    expect(getNextPenalty(4)).toEqual({ percent: 15, durationDays: 30 });
  });

  it("từ count=5 trở đi cấm", () => {
    expect(getNextPenalty(5)).toEqual({ ban: true, durationDays: 30 });
    expect(getNextPenalty(12)).toEqual({ ban: true, durationDays: 30 });
  });
});

describe("getAppliedPenaltyRule", () => {
  it("khớp rule đã áp theo count đã ghi nhận (count trước + 1)", () => {
    expect(getAppliedPenaltyRule(0)).toBeUndefined();
    expect(getAppliedPenaltyRule(1)).toBeUndefined(); // lần cảnh báo
    for (let prev = 1; prev <= 4; prev++) {
      expect(getAppliedPenaltyRule(prev + 1)).toEqual(getNextPenalty(prev));
    }
    expect(getAppliedPenaltyRule(6)).toBeUndefined(); // đã bị cấm
  });
});

describe("getPenaltyDeduction", () => {
  it("tính theo % của PENALTY_BASE_TOKEN, tối thiểu 1", () => {
    expect(getPenaltyDeduction(10)).toBe(100);
    expect(getPenaltyDeduction(15)).toBe(150);
    expect(getPenaltyDeduction(0)).toBe(1);
    expect(getPenaltyDeduction(0.01)).toBe(1);
  });
});
