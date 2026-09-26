import { describe, expect, it } from "vitest";
import { DEFAULT_ELIGIBILITY_RULES, type EligibilityRules } from "@/lib/contests/config";
import { evaluateEligibility } from "@/lib/contests/eligibility/engine";
import { ageOn } from "@/lib/contests/eligibility/rules";
import type { EligibilityContext } from "@/lib/contests/eligibility/types";

const NOW = new Date("2026-10-10T12:00:00Z");

function ctx(over: Partial<EligibilityContext> = {}, rules: Partial<EligibilityRules> = {}): EligibilityContext {
  return {
    now: NOW,
    contest: {
      id: "c1",
      status: "submission_open",
      submission_start: "2026-10-01T00:00:00Z",
      submission_end: "2026-10-20T16:59:00Z",
      voting_start: null,
      voting_end: null,
      results_published_at: null,
      rules_version: "1",
    },
    rules: { ...DEFAULT_ELIGIBILITY_RULES, ...rules },
    viewer: { userId: "author", emailVerified: true, dateOfBirth: "1995-05-05" },
    book: {
      id: "b1",
      author_id: "author",
      title: "Đêm Trên Vịnh Bắc",
      published: true,
      deleted_at: null,
      genre: "Linh dị",
      tags: ["kinh dị"],
      is_exclusive: true,
      published_at: "2026-10-02T00:00:00Z",
    },
    stats: { published_chapter_count: 9, total_words: 18240, priced_chapter_count: 0 },
    exclusivityAgreementAccepted: true,
    thisSubmission: null,
    otherActiveEntries: [],
    priorFinishedEntries: 0,
    priorAwards: 0,
    authorOtherActiveEntries: 0,
    acceptedRulesVersion: null,
    ...over,
  };
}

const failed = (c: EligibilityContext, phase: "preview" | "submit" | "close" = "preview") =>
  evaluateEligibility(c, phase).checks.filter((x) => !x.passed).map((x) => x.code);

describe("evaluateEligibility", () => {
  it("sách đủ điều kiện", () => {
    expect(evaluateEligibility(ctx(), "preview").eligible).toBe(true);
  });

  it("chạy hết mọi rule, không dừng ở lỗi đầu tiên", () => {
    const r = evaluateEligibility(
      ctx({ book: { ...ctx().book, published: false }, stats: { published_chapter_count: 0, total_words: 0, priced_chapter_count: 2 } }),
      "preview"
    );
    expect(r.eligible).toBe(false);
    expect(r.checks.filter((c) => !c.passed).map((c) => c.code)).toEqual(["book_visible", "min_published_chapters", "no_paid_chapters"]);
  });

  it("rule không bật thì không có trong danh sách", () => {
    const codes = evaluateEligibility(ctx(), "preview").checks.map((c) => c.code);
    expect(codes).not.toContain("min_words");
    expect(codes).not.toContain("require_exclusive");
  });

  it("submit mới kiểm đồng ý thể lệ", () => {
    expect(failed(ctx(), "preview")).not.toContain("rules_accepted");
    expect(failed(ctx(), "submit")).toContain("rules_accepted");
    expect(failed(ctx({ acceptedRulesVersion: "1" }), "submit")).toEqual([]);
  });

  it("close chỉ kiểm lại số chương/số chữ (D4)", () => {
    const codes = evaluateEligibility(ctx({ contest: { ...ctx().contest, status: "submission_closed" } }, { min_words: 5000 }), "close").checks.map((c) => c.code);
    expect(codes).toEqual(["min_published_chapters", "min_words"]);
  });
});

describe("từng rule", () => {
  it("ngoài khung nộp, kể cả khi cron chưa đổi status", () => {
    expect(failed(ctx({ contest: { ...ctx().contest, submission_end: "2026-10-09T00:00:00Z" } }))).toContain("contest_open");
  });

  it("không sở hữu sách", () => {
    expect(failed(ctx({ viewer: { ...ctx().viewer, userId: "someone" } }))).toContain("ownership");
  });

  it("sách bị gỡ", () => {
    expect(failed(ctx({ book: { ...ctx().book, deleted_at: "2026-10-05T00:00:00Z" } }))).toContain("book_visible");
  });

  it("số chữ: báo đúng số liệu thật", () => {
    const r = evaluateEligibility(ctx({}, { max_words: 5000 }), "preview");
    const c = r.checks.find((x) => x.code === "max_words")!;
    expect(c.passed).toBe(false);
    expect(c.message).toBe("Tối đa 5.000 chữ — hiện có 18.240, vượt 13.240 chữ");
    expect(c.details).toEqual({ required: 5000, actual: 18240 });
  });

  it("thể loại và tag", () => {
    expect(failed(ctx({}, { allowed_genres: ["Trinh thám"] }))).toContain("allowed_genres");
    expect(failed(ctx({}, { required_tags: ["Kinh Dị"] }))).not.toContain("required_tags");
    expect(failed(ctx({}, { required_tags: ["halloween"] }))).toContain("required_tags");
  });

  it("đăng lần đầu sau mốc", () => {
    expect(failed(ctx({}, { first_published_after: "2026-09-01T00:00:00Z" }))).not.toContain("first_published_after");
    expect(failed(ctx({}, { first_published_after: "2026-10-05T00:00:00Z" }))).toContain("first_published_after");
  });

  it("độc quyền (D11): cần cờ VÀ thỏa thuận bản hiện hành", () => {
    expect(failed(ctx({ book: { ...ctx().book, is_exclusive: false } }, { require_exclusive: true }))).toContain("require_exclusive");
    expect(failed(ctx({ exclusivityAgreementAccepted: false }, { require_exclusive: true }))).toContain("require_exclusive");
    expect(failed(ctx({}, { require_exclusive: true }))).not.toContain("require_exclusive");
  });

  it("nộp trùng / nộp lại sau khi rút", () => {
    expect(failed(ctx({ thisSubmission: { status: "eligible" } }))).toContain("not_already_entered");
    expect(failed(ctx({ thisSubmission: { status: "withdrawn" } }))).toContain("not_already_entered");
    expect(failed(ctx({ thisSubmission: { status: "withdrawn" } }, { allow_resubmit_after_withdraw: true }))).not.toContain("not_already_entered");
  });

  it("giới hạn số bài mỗi tác giả", () => {
    expect(failed(ctx({ authorOtherActiveEntries: 2 }, { max_entries_per_author: 2 }))).toContain("max_entries_per_author");
    expect(failed(ctx({ authorOtherActiveEntries: 1 }, { max_entries_per_author: 2 }))).not.toContain("max_entries_per_author");
  });

  it("đa cuộc thi — kiểm cả hai chiều", () => {
    const other = { contest_id: "c2", contest_title: "Halloween Horror 2026", allow_multi_contest: true };
    expect(failed(ctx({ otherActiveEntries: [other] }))).not.toContain("multi_contest");
    expect(failed(ctx({ otherActiveEntries: [other] }, { allow_multi_contest: false }))).toContain("multi_contest");
    expect(failed(ctx({ otherActiveEntries: [{ ...other, allow_multi_contest: false }] }))).toContain("multi_contest");
  });

  it("từng dự thi / từng đạt giải", () => {
    expect(failed(ctx({ priorFinishedEntries: 1 }, { no_prior_entries: true }))).toContain("no_prior_entries");
    expect(failed(ctx({ priorAwards: 1 }, { no_prior_awards: true }))).toContain("no_prior_awards");
    expect(failed(ctx({ priorAwards: 1 }))).not.toContain("no_prior_awards");
  });

  it("chương có giá (D8)", () => {
    expect(failed(ctx({ stats: { ...ctx().stats, priced_chapter_count: 1 } }))).toContain("no_paid_chapters");
  });

  it("email và tuổi tác giả (Q7)", () => {
    expect(failed(ctx({ viewer: { ...ctx().viewer, emailVerified: false } }))).toContain("email_verified");
    expect(failed(ctx({}, { min_author_age: 16 }))).not.toContain("min_author_age");
    expect(failed(ctx({ viewer: { ...ctx().viewer, dateOfBirth: null } }, { min_author_age: 16 }))).toContain("min_author_age");
    expect(failed(ctx({ viewer: { ...ctx().viewer, dateOfBirth: "2011-01-01" } }, { min_author_age: 16 }))).toContain("min_author_age");
  });
});

describe("ageOn", () => {
  it("tính theo ngày Việt Nam, đúng biên sinh nhật", () => {
    expect(ageOn("2010-10-10", new Date("2026-10-09T16:59:00Z"))).toBe(15); // 23:59 09/10 giờ VN
    expect(ageOn("2010-10-10", new Date("2026-10-09T17:00:00Z"))).toBe(16); // 00:00 10/10 giờ VN
  });
});
