import { describe, expect, it } from "vitest";
import { chapterWarnings, extractHeadingChapters, mergeChapterWithNext, splitChapterAt, splitChapters } from "./split-chapters";

describe("manuscript review", () => {
  it("warns about duplicate markers without discarding either chapter", () => {
    const { chapters } = splitChapters("Chương 1: Một\nNội dung A\nChương 1: Hai\nNội dung B\nChương 2\nNội dung C", "chuong");
    expect(chapters).toHaveLength(3);
    expect(chapterWarnings(chapters)).toContain("Mốc chương trùng: 1. Hãy đọc lại và gộp nếu cùng một chương.");
    const merged = mergeChapterWithNext(chapters, 0);
    expect(merged).toHaveLength(2);
    expect(merged[0].content).toBe("Nội dung A\n\nHai\n\nNội dung B");
    expect(chapterWarnings(merged)).toEqual([]);
  });
  it("preserves leading material when splitting by Word headings", () => {
    const chapters = extractHeadingChapters("<p>Lời mở đầu</p><h1>Chương 1</h1><p>A</p><h1>Chương 2</h1><p>B</p>");
    expect(chapters.map((c) => c.content)).toEqual(["Lời mở đầu", "A", "B"]);
    expect(chapters[0].no).toBe(0);
  });
  it("normalizes Windows newlines for blank-line splitting", () => {
    expect(splitChapters("A\r\n\r\n\r\nB", "blank").chapters.map((c) => c.content)).toEqual(["A", "B"]);
  });
  it("splits at the selected position without losing any text", () => {
    const chapters = splitChapters("Một hai ba bốn", "none").chapters;
    const split = splitChapterAt(chapters, 0, 7);
    expect(split).toHaveLength(2);
    expect(split.map((c) => c.content).join("")).toBe(chapters[0].content);
    expect(split.map((c) => c.words)).toEqual([2, 2]);
    expect(splitChapterAt(chapters, 0, 0)).toBe(chapters);
    expect(splitChapterAt(chapters, 0, chapters[0].content.length)).toBe(chapters);
  });
  it("warns about empty content and skipped numbering", () => {
    const chapters = splitChapters("Chương 1\nChương 3\nNội dung", "chuong").chapters;
    expect(chapterWarnings(chapters)).toHaveLength(2);
  });
});
