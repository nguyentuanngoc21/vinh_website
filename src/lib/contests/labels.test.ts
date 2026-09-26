import { describe, expect, it } from "vitest";
import { ADMIN_NEXT_SUBMISSION_STATUSES, NEXT_CONTEST_STATUSES } from "@/lib/contests/labels";

// Bản sao ma trận trong contest_status_transition_allowed() /
// contest_submission_transition_allowed() (migrations/20260926_add_contest_engine_core.sql).
// Test này chỉ giữ ma trận UI không lệch khỏi bản SQL đã chốt.
const SQL_CONTEST_TRANSITIONS = [
  "draft>announced", "announced>submission_open", "submission_open>submission_closed",
  "submission_closed>community_voting", "submission_closed>judging", "submission_closed>results",
  "community_voting>judging", "community_voting>results", "judging>results", "results>archived",
];
const SQL_SUBMISSION_TRANSITIONS = [
  "submitted>eligible", "submitted>ineligible", "submitted>withdrawn", "submitted>disqualified",
  "eligible>ineligible", "eligible>withdrawn", "eligible>shortlisted", "eligible>disqualified",
  "ineligible>eligible", "ineligible>disqualified", "withdrawn>eligible", "shortlisted>disqualified",
];

describe("ma trận trạng thái phía UI khớp SQL", () => {
  it("cuộc thi", () => {
    const ui = Object.entries(NEXT_CONTEST_STATUSES).flatMap(([from, tos]) => tos.map((to) => `${from}>${to}`));
    expect(ui.sort()).toEqual([...SQL_CONTEST_TRANSITIONS].sort());
  });

  it("bài dự thi: admin có mọi chuyển trừ rút bài / nộp lại (của tác giả)", () => {
    const ui = Object.entries(ADMIN_NEXT_SUBMISSION_STATUSES).flatMap(([from, tos]) => tos.map((to) => `${from}>${to}`));
    const expected = SQL_SUBMISSION_TRANSITIONS.filter((t) => !t.endsWith(">withdrawn") && !t.startsWith("withdrawn>"));
    expect(ui.sort()).toEqual(expected.sort());
  });
});
