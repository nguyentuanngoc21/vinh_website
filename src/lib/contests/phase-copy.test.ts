import { describe, expect, it } from "vitest";
import { countdownFor, formatRemaining, PHASE_COPY, resolveTab, stepsFor, tabForAction } from "@/lib/contests/phase-copy";

const base = {
  submission_start: "2026-10-01T00:00:00Z",
  submission_end: "2026-10-20T16:59:00Z",
  voting_start: "2026-10-23T00:00:00Z",
  voting_end: "2026-11-15T00:00:00Z",
  judging_start: "2026-11-16T00:00:00Z",
  result_at: "2026-12-15T00:00:00Z",
  results_published_at: null,
};

describe("PHASE_COPY", () => {
  it("D12: sau khi đóng nhận bài không nói tác giả không sửa được", () => {
    expect(PHASE_COPY.submission_closed.banner).toBe("Bản dự thi đã được chốt; chỉnh sửa sau thời điểm này không tính vào bản chấm.");
    expect(Object.values(PHASE_COPY).some((p) => p.banner?.includes("không thể chỉnh sửa"))).toBe(false);
  });

  it("CTA chính theo giai đoạn", () => {
    expect(PHASE_COPY.announced.primary.action).toBe("remind");
    expect(PHASE_COPY.submission_open.primary.action).toBe("submit");
    expect(PHASE_COPY.community_voting.primary.action).toBe("vote");
    expect(PHASE_COPY.archived.primary.action).toBe("results");
  });
});

describe("tab", () => {
  it("kết thúc thì đổi bộ tab, URL cũ vẫn dẫn đúng", () => {
    expect(resolveTab("submission_open", "bai")).toBe("bai");
    expect(resolveTab("archived", "bai")).toBe("tac-pham");
    expect(resolveTab("submission_open", "tac-pham")).toBe("bai");
    expect(resolveTab("results", null)).toBe("ket-qua");
    expect(resolveTab("submission_open", "không-có")).toBe("kham-pha");
  });

  it("CTA dẫn tới tab", () => {
    expect(tabForAction("vote", "community_voting")).toBe("bai");
    expect(tabForAction("entries", "archived")).toBe("tac-pham");
    expect(tabForAction("remind", "announced")).toBeNull();
  });
});

describe("countdownFor / formatRemaining", () => {
  it("mốc theo giai đoạn", () => {
    expect(countdownFor({ ...base, status: "submission_open" })).toMatchObject({ label: "đóng nhận bài sau", target: base.submission_end });
    expect(countdownFor({ ...base, status: "judging" })).toMatchObject({ mode: "date", target: base.result_at });
    expect(countdownFor({ ...base, status: "submission_closed", voting_start: null })).toMatchObject({ label: "dự kiến công bố" });
    expect(countdownFor({ ...base, status: "results" })).toBeNull();
  });

  it("dưới 48 giờ chuyển giờ:phút", () => {
    expect(formatRemaining((12 * 24 + 4) * 3_600_000)).toBe("12 ngày 04 giờ");
    expect(formatRemaining((47 * 60 + 5) * 60_000)).toBe("47 giờ 05 phút");
    expect(formatRemaining(-1)).toBe("0 phút");
  });
});

describe("stepsFor", () => {
  it("6 chặng, chặng hiện tại theo trạng thái", () => {
    const s = stepsFor({ ...base, status: "community_voting" }, "2026-09-15T00:00:00Z");
    expect(s.map((x) => x.state)).toEqual(["done", "done", "done", "current", "upcoming", "upcoming"]);
    expect(s[0].date).toBe("2026-09-15T00:00:00Z");
  });

  it("lưu trữ: mọi chặng đã xong", () => {
    expect(stepsFor({ ...base, status: "archived" }, null).every((x) => x.state === "done")).toBe(true);
  });
});
