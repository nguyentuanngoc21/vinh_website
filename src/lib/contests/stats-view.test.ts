import { describe, expect, it } from "vitest";
import { buildKpis, formatDuration, parseEntryStats, retention, sourceShares } from "./stats-view";

const RAW = {
  since: "2026-09-06T00:00:00Z",
  chapter_count: 3,
  readers: 3,
  return_readers: 1,
  completed_readers: 1,
  continue_rate: "0.5833",
  avg_session_seconds: 53,
  sources: [
    { source: "contest", readers: 2 },
    { source: "search", readers: 1 },
    { source: "other", readers: 1 },
  ],
  funnel: [
    { chapter_id: "a", title: "C1", position: 1, readers: 4 },
    { chapter_id: "b", title: "C2", position: 2, readers: 2 },
    { chapter_id: "c", title: "C3", position: 3, readers: 1 },
  ],
  comments: 3,
  commenters: 2,
  new_followers: 2,
  new_followers_7d: 1,
  valid_readers: 2,
  readers_7d: 1,
};

describe("parseEntryStats", () => {
  it("đọc jsonb từ SQL (numeric có thể là chuỗi)", () => {
    const s = parseEntryStats(RAW);
    expect(s.continueRate).toBeCloseTo(0.5833);
    expect(s.funnel.map((f) => f.readers)).toEqual([4, 2, 1]);
    expect(s.validReaders).toBe(2);
  });

  it("dữ liệu hỏng / thiếu → số 0, không ném lỗi", () => {
    const s = parseEntryStats(null);
    expect(s.readers).toBe(0);
    expect(s.continueRate).toBeNull();
    expect(s.sources).toEqual([]);
    expect(parseEntryStats({ sources: [{ source: "hack", readers: 3 }] }).sources[0].source).toBe("other");
  });
});

describe("buildKpis", () => {
  const s = parseEntryStats(RAW);

  it("8 ô theo đúng thứ tự thiết kế", () => {
    expect(buildKpis(s, { state: "hidden", rank: 4 }).map((k) => k.label)).toEqual([
      "Độc giả đọc thật",
      "Độc giả quay lại",
      "Tỷ lệ đọc hết",
      "Đọc tiếp chương sau",
      "Người theo dõi mới",
      "Phiếu bình chọn",
      "Bình luận",
      "Thời gian đọc TB",
    ]);
  });

  it("tỷ lệ tính trên số người đã đọc", () => {
    const k = Object.fromEntries(buildKpis(s, { state: "not_open", opensAt: null }).map((x) => [x.key, x]));
    expect(k.return_readers.value).toBe("33%");
    expect(k.completion.value).toBe("33%");
    expect(k.continue.value).toBe("58%");
    expect(k.valid_readers.sub).toBe("+1 trong 7 ngày");
    expect(k.comments.sub).toBe("từ 2 độc giả");
  });

  it("P9: đang bình chọn → ẩn số phiếu nhưng vẫn có hạng", () => {
    const v = buildKpis(s, { state: "hidden", rank: 4 }).find((x) => x.key === "votes")!;
    expect(v.value).toBe("Ẩn");
    expect(v.sub).toContain("hạng #4");
  });

  it("hết bình chọn → hiện số phiếu", () => {
    const v = buildKpis(s, { state: "visible", votes: 1402, rank: null }).find((x) => x.key === "votes")!;
    expect(v.value).toBe("1.402");
    expect(v.sub).toBe("ngoài top 100 bảng phiếu bình chọn");
  });

  it("truyện 1 chương / chưa có người đọc", () => {
    const one = parseEntryStats({ ...RAW, chapter_count: 1, continue_rate: null, readers: 0 });
    const k = Object.fromEntries(buildKpis(one, { state: "not_open", opensAt: null }).map((x) => [x.key, x]));
    expect(k.continue.value).toBe("—");
    expect(k.continue.sub).toBe("truyện 1 chương");
    expect(k.return_readers.value).toBe("—");
  });
});

describe("nguồn + giữ chân", () => {
  it("nguồn theo %, lớn → nhỏ", () => {
    expect(sourceShares(parseEntryStats(RAW))).toEqual([
      { source: "contest", label: "Trang cuộc thi", percent: 50 },
      { source: "search", label: "Tìm kiếm", percent: 25 },
      { source: "other", label: "Khác", percent: 25 },
    ]);
  });

  it("giữ chân so với chương 1", () => {
    expect(retention(parseEntryStats(RAW)).map((r) => r.percent)).toEqual([100, 50, 25]);
  });

  it("thời lượng", () => {
    expect(formatDuration(53)).toBe("53 giây");
    expect(formatDuration(660)).toBe("11 phút");
    expect(formatDuration(null)).toBe("—");
  });
});
