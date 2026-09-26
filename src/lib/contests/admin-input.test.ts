import { describe, expect, it } from "vitest";
import { parseAwardInput, parseContestPatch, validateTimeline, vndToTokens } from "@/lib/contests/admin-input";
import { formatVnDateTime, isoToVnLocal, vnLocalToIso } from "@/lib/contests/datetime";

const valid = {
  slug: "vwa-2026",
  title: "Vịnh Writing Awards 2026",
  submission_start: "2026-10-01T00:00:00Z",
  submission_end: "2026-10-20T16:59:00Z",
};

describe("parseContestPatch", () => {
  it("tạo mới: chuẩn hoá đủ cấu hình", () => {
    const r = parseContestPatch(valid, "create");
    if (!r.ok) throw new Error(r.errors.join());
    expect(r.value.eligibility_rules).toHaveProperty("allow_multi_contest", true);
    expect(r.value.vote_rules).toEqual({ min_account_age_days: 7, require_completed_chapter: true });
  });

  it("tạo mới: thiếu trường bắt buộc", () => {
    const r = parseContestPatch({ title: "x" }, "create");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("|")).toMatch(/slug.*submission_start.*submission_end/);
  });

  it("slug sai định dạng hoặc trùng đường dẫn hệ thống", () => {
    expect(parseContestPatch({ ...valid, slug: "Vịnh 2026" }, "create").ok).toBe(false);
    expect(parseContestPatch({ ...valid, slug: "cron" }, "create").ok).toBe(false);
  });

  it("từ chối trường không được sửa (status, created_by…)", () => {
    const r = parseContestPatch({ status: "results" }, "update");
    expect(r.ok).toBe(false);
  });

  it("sửa: chỉ trả trường gửi lên, không chèn default cho cấu hình không gửi", () => {
    const r = parseContestPatch({ title: "  Tên mới  " }, "update");
    expect(r).toEqual({ ok: true, value: { title: "Tên mới" } });
  });

  it("URL rỗng → null, URL sai → lỗi", () => {
    expect(parseContestPatch({ banner_url: "" }, "update")).toEqual({ ok: true, value: { banner_url: null } });
    expect(parseContestPatch({ banner_url: "javascript:alert(1)" }, "update").ok).toBe(false);
  });

  it("giải thưởng trong thể lệ", () => {
    const r = parseContestPatch({ prizes_summary: [{ name: " Giải Nhất ", amount_vnd: 20_000_000 }] }, "update");
    expect(r).toEqual({ ok: true, value: { prizes_summary: [{ name: "Giải Nhất", amount_vnd: 20_000_000, extra: "" }] } });
    expect(parseContestPatch({ prizes_summary: [{ name: "x", amount_vnd: -1 }] }, "update").ok).toBe(false);
  });

  it("lỗi cấu hình eligibility được đưa ra ngoài", () => {
    const r = parseContestPatch({ eligibility_rules: { max_words: 0 } }, "update");
    expect(r.ok).toBe(false);
  });
});

describe("validateTimeline", () => {
  const base = { submission_start: "2026-10-01T00:00:00Z", submission_end: "2026-10-20T16:59:00Z" };

  it("hợp lệ", () => {
    expect(validateTimeline({ ...base, voting_start: "2026-10-23T00:00:00Z", voting_end: "2026-11-15T00:00:00Z", result_at: "2026-12-15T00:00:00Z" })).toEqual([]);
  });

  it("bình chọn phải sau khi đóng nhận bài", () => {
    expect(validateTimeline({ ...base, voting_start: "2026-10-10T00:00:00Z", voting_end: "2026-11-15T00:00:00Z" })).toHaveLength(1);
  });

  it("bình chọn thiếu một đầu", () => {
    expect(validateTimeline({ ...base, voting_start: "2026-10-23T00:00:00Z", voting_end: null })).toHaveLength(1);
  });

  it("đóng trước mở", () => {
    expect(validateTimeline({ submission_start: base.submission_end, submission_end: base.submission_start })).toHaveLength(1);
  });

  it("công bố trước khi hết bình chọn", () => {
    expect(validateTimeline({ ...base, voting_start: "2026-10-23T00:00:00Z", voting_end: "2026-11-15T00:00:00Z", result_at: "2026-11-01T00:00:00Z" })).toHaveLength(1);
  });
});

describe("parseAwardInput / vndToTokens (D10)", () => {
  const id = "0f8f1b1e-5a5c-4a52-9a53-7b0e9d1c2a11";

  it("quy đổi VND → token, làm tròn xuống, lưu tỷ giá", () => {
    expect(vndToTokens(20_000_000, 200)).toBe(100_000);
    expect(vndToTokens(199, 200)).toBe(0);
    const r = parseAwardInput({ submission_id: id, award_code: "first_prize", award_name: "Giải Nhất", prize_vnd: 20_000_000 });
    expect(r.ok && r.value.prize_tokens).toBe(vndToTokens(20_000_000));
    expect(r.ok && r.value.token_vnd_rate).toBeGreaterThan(0);
  });

  it("từ chối mã giải, số tiền, hạng sai", () => {
    const r = parseAwardInput({ submission_id: "x", award_code: "Giải 1", award_name: "", prize_vnd: 1.5, award_rank: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toHaveLength(5);
  });
});

describe("datetime (giờ Việt Nam)", () => {
  it("datetime-local ⇄ ISO", () => {
    expect(vnLocalToIso("2026-10-20T23:59")).toBe("2026-10-20T16:59:00.000Z");
    expect(isoToVnLocal("2026-10-20T16:59:00.000Z")).toBe("2026-10-20T23:59");
    expect(vnLocalToIso("2026-02-31T10:00")).toBeNull();
    expect(vnLocalToIso("hôm nay")).toBeNull();
    expect(isoToVnLocal(null)).toBe("");
  });

  it("hiển thị theo giờ Việt Nam", () => {
    expect(formatVnDateTime("2026-10-20T16:59:00Z")).toContain("23:59");
    expect(formatVnDateTime("2026-10-20T16:59:00Z")).toContain("20/10/2026");
    expect(formatVnDateTime(null)).toBe("—");
  });
});
