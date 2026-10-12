import { describe, expect, it } from "vitest";
import { isChapterInContestWindow, selectedChapterChecks, type ContestChapter } from "./chapter-selection";

const start = "2026-10-01T00:00:00Z", end = "2026-10-20T00:00:00Z";
const chapter: ContestChapter = {
  id: "new", book_id: "old-story", title: "Chương mới", order_index: 12,
  created_at: start, published_at: "2026-10-02T00:00:00Z", published: true,
  removed_at: null, price: 0, audio_price: 0, word_count: 500,
};

describe("contest chapter selection", () => {
  it("accepts new chapters in an existing story, including the opening instant", () => {
    expect(isChapterInContestWindow(chapter, start, end)).toBe(true);
    expect(selectedChapterChecks([chapter], [chapter.id], start, end)[0].passed).toBe(true);
  });
  it.each([
    { created_at: "2026-09-30T23:59:59Z" },
    { published_at: "2026-09-30T23:59:59Z" },
    { created_at: end }, { published_at: end }, { published_at: null },
    { published: false }, { removed_at: start }, { created_at: "invalid" },
  ])("rejects an old draft, out-of-window publication, or unavailable chapter: %j", (changes) => {
    expect(isChapterInContestWindow({ ...chapter, ...changes }, start, end)).toBe(false);
  });
  it.each([[], ["missing"], ["new", "new"], ["new", "missing"]].map((ids) => ({ ids })))("rejects an empty, duplicate or foreign selection: %j", ({ ids }) => {
    expect(selectedChapterChecks([chapter], ids, start, end)[0].passed).toBe(false);
  });
});
