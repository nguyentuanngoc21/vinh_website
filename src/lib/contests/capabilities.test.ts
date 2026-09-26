import { describe, expect, it } from "vitest";
import {
  getContestCapabilities,
  getEntryVoteState,
  type ContestTimeline,
  type ContestViewer,
  type ViewerSubmission,
} from "@/lib/contests/capabilities";
import type { ContestReviewFlag } from "@/lib/supabase/types";

const NOW = new Date("2026-10-10T12:00:00Z");
const h = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000).toISOString();

const base: ContestTimeline = {
  status: "submission_open",
  submission_start: h(-240),
  submission_end: h(240),
  voting_start: h(300),
  voting_end: h(600),
  results_published_at: null,
};
const viewer: ContestViewer = { userId: "u1", accountCreatedAt: h(-24 * 60) };
const eligibility = { allow_resubmit_after_withdraw: false };
const vote = { min_account_age_days: 7 };

function caps(over: Partial<ContestTimeline> = {}, opts: { sub?: ViewerSubmission | null; resubmit?: boolean; viewer?: ContestViewer } = {}) {
  return getContestCapabilities({
    contest: { ...base, ...over },
    eligibility: { allow_resubmit_after_withdraw: opts.resubmit ?? eligibility.allow_resubmit_after_withdraw },
    vote,
    viewer: opts.viewer ?? viewer,
    viewerSubmission: opts.sub ?? null,
    now: NOW,
  });
}

describe("nộp bài", () => {
  it("mở trong khung nộp", () => {
    expect(caps().can_submit).toBe(true);
  });

  it("cron trễ: status còn submission_open nhưng đã quá hạn → không nộp được", () => {
    const c = caps({ submission_end: h(-1) });
    expect(c.can_submit).toBe(false);
    expect(c.reasons.can_submit).toBe("submission_closed");
  });

  it("biên hạn: đúng thời điểm submission_end là đã đóng", () => {
    expect(caps({ submission_end: NOW.toISOString() }).can_submit).toBe(false);
  });

  it("chưa đến submission_start", () => {
    const c = caps({ submission_start: h(1) });
    expect(c.can_submit).toBe(false);
    expect(c.reasons.can_submit).toBe("submission_not_open");
  });

  it("chưa đăng nhập", () => {
    const c = caps({}, { viewer: { userId: null, accountCreatedAt: null } });
    expect(c.can_submit).toBe(false);
    expect(c.reasons.can_submit).toBe("not_logged_in");
  });
});

describe("rút / nộp lại / sửa", () => {
  const eligible: ViewerSubmission = { status: "eligible", review_flags: [] };

  it("rút được trước hạn, không rút được sau hạn (D6)", () => {
    expect(caps({}, { sub: eligible }).can_withdraw).toBe(true);
    const after = caps({ status: "submission_closed", submission_end: h(-1) }, { sub: eligible });
    expect(after.can_withdraw).toBe(false);
    expect(after.reasons.can_withdraw).toBe("withdraw_closed");
    expect(after.can_edit_submission).toBe(false);
  });

  it("nộp lại chỉ khi cuộc thi cho phép", () => {
    const withdrawn: ViewerSubmission = { status: "withdrawn", review_flags: [] };
    expect(caps({}, { sub: withdrawn }).can_resubmit).toBe(false);
    expect(caps({}, { sub: withdrawn }).reasons.can_resubmit).toBe("resubmit_not_allowed");
    expect(caps({}, { sub: withdrawn, resubmit: true }).can_resubmit).toBe(true);
  });

  it("bài bị loại không rút, không sửa", () => {
    const c = caps({}, { sub: { status: "disqualified", review_flags: [] } });
    expect(c.can_withdraw).toBe(false);
    expect(c.can_edit_submission).toBe(false);
  });
});

describe("bình chọn", () => {
  const voting = { status: "community_voting" as const, submission_end: h(-100), voting_start: h(-10), voting_end: h(10) };

  it("mở trong khung bình chọn", () => {
    expect(caps(voting).can_vote).toBe(true);
  });

  it("tài khoản < 7 ngày", () => {
    const c = caps(voting, { viewer: { userId: "u1", accountCreatedAt: h(-24 * 3) } });
    expect(c.can_vote).toBe(false);
    expect(c.reasons.can_vote).toBe("account_too_new");
  });

  it("quá voting_end dù status chưa đổi", () => {
    const c = caps({ ...voting, voting_end: h(-1) });
    expect(c.can_vote).toBe(false);
    expect(c.reasons.can_vote).toBe("voting_closed");
  });

  it("trước khi mở bình chọn", () => {
    expect(caps().reasons.can_vote).toBe("voting_not_open");
  });
});

describe("xếp hạng & feed (Q3)", () => {
  it("trước bình chọn: chưa có Top truyện; có feed mới + đề xuất", () => {
    const c = caps();
    expect(c.rankings_visible.popular).toBe(false);
    expect(c.available_feeds).toEqual(["new", "discover"]);
  });

  it("đang bình chọn: hiện hạng nhưng ẩn số phiếu", () => {
    const c = caps({ status: "community_voting", voting_start: h(-10), voting_end: h(10) });
    expect(c.rankings_visible.popular).toBe(true);
    expect(c.popular_values_visible).toBe(false);
    expect(c.available_feeds).toContain("top");
  });

  it("hết khung bình chọn: hiện số phiếu", () => {
    expect(caps({ status: "judging", voting_end: h(-10) }).popular_values_visible).toBe(true);
  });

  it("BGK và Chung cuộc chỉ hiện khi đã công bố kết quả", () => {
    expect(caps({ status: "judging" }).rankings_visible.jury).toBe(false);
    const r = caps({ status: "results", results_published_at: h(-1) });
    expect(r.results_visible).toBe(true);
    expect(r.rankings_visible.final).toBe(true);
    expect(caps({ status: "results", results_published_at: h(1) }).results_visible).toBe(false);
  });

  it("nháp / sắp mở: không có feed nào", () => {
    expect(caps({ status: "announced" }).available_feeds).toEqual([]);
  });
});

describe("hạn chót", () => {
  it("chip Sắp đóng khi còn dưới 48 giờ", () => {
    expect(caps({ submission_end: h(47) }).closing_soon).toBe(true);
    expect(caps({ submission_end: h(49) }).closing_soon).toBe(false);
  });

  it("next_change_at là mốc gần nhất, kể cả mốc bật Sắp đóng", () => {
    expect(caps({ submission_end: h(50) }).next_change_at).toBe(h(2));
    expect(caps({ submission_end: h(20) }).next_change_at).toBe(h(20));
  });
});

describe("Cần bổ sung (Q2)", () => {
  const flag = (over: Partial<ContestReviewFlag>): ContestReviewFlag => ({
    id: "f", code: "synopsis_too_short", source: "admin", message: "Thiếu tóm tắt", visible_to_author: true,
    fix_by: h(48), created_at: h(-1), created_by: null, resolved_at: null, resolved_by: null, resolution: null, ...over,
  });

  it("còn cờ mở → needs_revision + hạn sớm nhất", () => {
    const c = caps({}, { sub: { status: "eligible", review_flags: [flag({ fix_by: h(72) }), flag({ fix_by: h(24) })] } });
    expect(c.needs_revision).toBe(true);
    expect(c.revision_deadline).toBe(h(24));
  });

  it("cờ đã xử lý hoặc tác giả không thấy → không tính", () => {
    const c = caps({}, { sub: { status: "eligible", review_flags: [flag({ resolved_at: h(-1) }), flag({ visible_to_author: false })] } });
    expect(c.needs_revision).toBe(false);
  });
});

describe("getEntryVoteState", () => {
  const votingCaps = caps({ status: "community_voting", voting_start: h(-10), voting_end: h(10) });
  const entry = { author_id: "author", status: "eligible" as const, book_visible: true };
  const state = (over: Partial<Parameters<typeof getEntryVoteState>[0]> = {}) =>
    getEntryVoteState({ capabilities: votingCaps, viewerId: "u1", entry, hasVoted: false, hasCompletedChapter: true, requireCompletedChapter: true, ...over });

  it("hợp lệ", () => {
    expect(state()).toMatchObject({ can_vote: true, reason: null });
  });

  it("thứ tự lý do khớp cast_contest_vote()", () => {
    expect(state({ entry: { ...entry, status: "disqualified" } }).reason).toBe("entry_not_votable");
    expect(state({ entry: { ...entry, book_visible: false } }).reason).toBe("entry_not_votable");
    expect(state({ entry: { ...entry, author_id: "u1" } }).reason).toBe("own_entry");
    expect(state({ hasCompletedChapter: false }).reason).toBe("no_completed_chapter");
  });

  it("đã bình chọn → không bình chọn thêm, bỏ phiếu được trong khung", () => {
    expect(state({ hasVoted: true })).toMatchObject({ can_vote: false, has_voted: true, can_retract: true });
  });

  it("hết khung → không bỏ phiếu", () => {
    const closed = caps({ status: "judging", voting_end: h(-1) });
    expect(state({ capabilities: closed, hasVoted: true })).toMatchObject({ can_retract: false, reason: "voting_closed" });
  });
});
