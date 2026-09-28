import { describe, expect, it } from "vitest";
import { parsePassport, PASSPORT_MILESTONES } from "./passport-service";

describe("parsePassport", () => {
  it("gắn nhãn, đếm mốc đã đạt", () => {
    const p = parsePassport({
      milestones: [
        { code: "read_entry", progress: 1, target: 1 },
        { code: "read_3_authors", progress: 2, target: 3 },
        { code: "vote_3", progress: 3, target: 3 },
      ],
      completed_at: null,
    });
    expect(p.doneCount).toBe(2);
    expect(p.milestones[1]).toMatchObject({ title: "Đọc bài của 3 tác giả", done: false, progress: 2, target: 3 });
    expect(p.completedAt).toBeNull();
  });

  it("dữ liệu hỏng / mã lạ → không ném lỗi", () => {
    expect(parsePassport(null)).toEqual({ milestones: [], doneCount: 0, completedAt: null });
    expect(parsePassport({ milestones: [{ code: "x", progress: "1", target: "1" }] }).milestones[0]).toMatchObject({ title: "x", done: true });
  });

  it("đủ nhãn cho 7 cột mốc SQL (K5)", () => {
    expect(Object.keys(PASSPORT_MILESTONES).sort()).toEqual(
      ["comment_entry", "finish_entry", "hidden_gem", "read_3_authors", "read_entry", "return_3_days", "vote_3"]
    );
  });
});
