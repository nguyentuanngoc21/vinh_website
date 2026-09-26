import { describe, expect, it } from "vitest";
import { DEFAULT_ELIGIBILITY_RULES } from "@/lib/contests/config";
import { CLOSE_FLAG_CODE, evaluateCloseChecks } from "@/lib/contests/eligibility/close";
import { ELIGIBILITY_RULES } from "@/lib/contests/eligibility/rules";

const contest = {
  id: "c",
  rules_version: "1",
  status: "submission_closed" as const,
  submission_start: "2026-10-01T00:00:00Z",
  submission_end: "2026-10-20T16:59:00Z",
  voting_start: null,
  voting_end: null,
  results_published_at: null,
};
const now = new Date("2026-10-21T00:00:00Z");

describe("evaluateCloseChecks (D4)", () => {
  it("chỉ các rule đếm chương / chữ chạy lúc đóng cổng — và đều có mã cờ", () => {
    const closeRules = ELIGIBILITY_RULES.filter((r) => r.phases.includes("close")).map((r) => r.code);
    expect(closeRules.sort()).toEqual(Object.keys(CLOSE_FLAG_CODE).sort());
  });

  it("bản chụp đủ điều kiện → không cờ", () => {
    const failed = evaluateCloseChecks({ contest, rules: { ...DEFAULT_ELIGIBILITY_RULES, min_words: 100 }, stats: { chapter_count: 3, total_words: 500 }, now });
    expect(failed).toEqual([]);
  });

  it("tụt dưới ngưỡng sau khi nộp → trả rule trượt kèm số liệu của bản chụp", () => {
    const failed = evaluateCloseChecks({
      contest,
      rules: { ...DEFAULT_ELIGIBILITY_RULES, min_published_chapters: 3, max_words: 1000 },
      stats: { chapter_count: 1, total_words: 1500 },
      now,
    });
    expect(failed.map((c) => c.code)).toEqual(["min_published_chapters", "max_words"]);
    expect(failed[0].message).toContain("hiện có 1");
  });
});
