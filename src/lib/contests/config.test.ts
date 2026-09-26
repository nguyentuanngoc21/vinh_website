import { describe, expect, it } from "vitest";
import {
  DEFAULT_ELIGIBILITY_RULES,
  DEFAULT_VOTE_RULES,
  normalizeEligibilityRules,
  normalizeScoringConfig,
  normalizeVoteRules,
  readContestConfig,
} from "@/lib/contests/config";

// Khoá mà DB đọc thẳng (contest_config_missing_key() trong
// migrations/20260926_add_contest_engine_core.sql) — phải luôn có trong kết quả chuẩn hoá.
const DB_ELIGIBILITY_KEYS = ["allow_resubmit_after_withdraw", "require_exclusive", "allow_multi_contest", "max_entries_per_author"];
const DB_VOTE_KEYS = ["min_account_age_days", "require_completed_chapter"];

describe("normalizeEligibilityRules", () => {
  it("điền đủ default khi không có input", () => {
    const r = normalizeEligibilityRules(undefined);
    expect(r).toEqual({ ok: true, value: DEFAULT_ELIGIBILITY_RULES });
  });

  it("luôn ghi đủ mọi khoá DB đọc", () => {
    const r = normalizeEligibilityRules({ min_words: 5000 });
    if (!r.ok) throw new Error(r.errors.join());
    for (const k of DB_ELIGIBILITY_KEYS) expect(r.value).toHaveProperty(k);
    expect(r.value.min_words).toBe(5000);
  });

  it("từ chối khoá lạ (lỗi đánh máy không được âm thầm tắt luật)", () => {
    const r = normalizeEligibilityRules({ min_word: 5000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain("min_word");
  });

  it("từ chối sai kiểu và báo từng lỗi", () => {
    const r = normalizeEligibilityRules({ require_exclusive: "yes", max_entries_per_author: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toHaveLength(2);
  });

  it("từ chối thể loại không có trong danh mục", () => {
    const r = normalizeEligibilityRules({ allowed_genres: ["Trinh thám", "Fanfic"] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain("Fanfic");
  });

  it("chấp nhận thể loại hợp lệ", () => {
    const r = normalizeEligibilityRules({ allowed_genres: ["Trinh thám"] });
    expect(r.ok && r.value.allowed_genres).toEqual(["Trinh thám"]);
  });

  it("từ chối min_words > max_words", () => {
    expect(normalizeEligibilityRules({ min_words: 9000, max_words: 5000 }).ok).toBe(false);
  });

  it("từ chối mốc thời gian không hợp lệ", () => {
    expect(normalizeEligibilityRules({ first_published_after: "không phải ngày" }).ok).toBe(false);
  });

  it("từ chối input không phải object", () => {
    expect(normalizeEligibilityRules([]).ok).toBe(false);
  });
});

describe("normalizeVoteRules / normalizeScoringConfig", () => {
  it("default vote rules đúng D5 (tài khoản ≥ 7 ngày, đã đọc hết ≥ 1 chương)", () => {
    const r = normalizeVoteRules({});
    expect(r).toEqual({ ok: true, value: DEFAULT_VOTE_RULES });
    if (r.ok) for (const k of DB_VOTE_KEYS) expect(r.value).toHaveProperty(k);
    expect(DEFAULT_VOTE_RULES).toEqual({ min_account_age_days: 7, require_completed_chapter: true });
  });

  it("chỉ nhận công thức đã có", () => {
    expect(normalizeScoringConfig({ popular_formula_id: "popular-v9" }).ok).toBe(false);
  });

  it("mặc định popular-v2 + ngưỡng meaningful read P2 (40%, 30 giây, 250 chữ/phút)", () => {
    expect(normalizeScoringConfig({})).toEqual({
      ok: true,
      value: { popular_formula_id: "popular-v2", meaningful_read_ratio: 0.4, meaningful_read_min_seconds: 30, reading_words_per_minute: 250 },
    });
  });

  it("cuộc thi cũ chỉ lưu popular-v1 vẫn đọc được, giữ công thức đã khoá", () => {
    const r = normalizeScoringConfig({ popular_formula_id: "popular-v1" });
    expect(r.ok && r.value.popular_formula_id).toBe("popular-v1");
    expect(r.ok && r.value.meaningful_read_ratio).toBe(0.4);
  });

  it.each([
    { meaningful_read_ratio: 0 },
    { meaningful_read_ratio: 1.5 },
    { meaningful_read_min_seconds: -1 },
    { meaningful_read_min_seconds: 2.5 },
    { reading_words_per_minute: 0 },
    { reading_words_per_minute: "250" },
  ])("từ chối ngưỡng sai %j", (input) => {
    expect(normalizeScoringConfig(input).ok).toBe(false);
  });
});

describe("readContestConfig", () => {
  it("ném lỗi khi dữ liệu trong DB hỏng thay vì dùng default", () => {
    expect(() => readContestConfig({ eligibility_rules: { bogus: 1 }, vote_rules: {}, scoring_config: {} })).toThrow(/bogus/);
  });
});
