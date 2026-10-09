import { describe, expect, it } from "vitest";
import { buildStyledSegments, displayText, parseBlock, parseInline } from "./chapter-format";

describe("parseBlock", () => {
  it("detects scene breaks in the common spellings", () => {
    for (const p of ["---", "***", "* * *", "-----", " *** "]) expect(parseBlock(p).kind).toBe("divider");
    expect(parseBlock("--").kind).toBe("paragraph");
  });
  it("detects single-line headings only", () => {
    expect(parseBlock("## Chương mở đầu")).toMatchObject({ kind: "heading", text: "Chương mở đầu" });
    expect(parseBlock("## a\nb").kind).toBe("paragraph");
    expect(parseBlock("##không cách").kind).toBe("paragraph");
  });
  it("treats a paragraph as a quote only when every line is quoted", () => {
    expect(parseBlock("> Dòng một\n> Dòng hai")).toMatchObject({ kind: "quote", text: "Dòng một\nDòng hai" });
    expect(parseBlock("> Dòng một\nDòng hai").kind).toBe("paragraph");
  });
});

describe("parseInline", () => {
  it("removes bold/italic markers and records their ranges", () => {
    expect(parseInline("Hắn **cười** rồi *đi*.")).toEqual({
      text: "Hắn cười rồi đi.",
      ranges: [{ start: 4, end: 8, bold: true }, { start: 13, end: 15, italic: true }],
    });
  });
  it("supports italic inside bold", () => {
    const r = parseInline("**rất *nhanh* thôi**");
    expect(r.text).toBe("rất nhanh thôi");
    expect(r.ranges).toContainEqual({ start: 4, end: 9, italic: true });
    expect(r.ranges).toContainEqual({ start: 0, end: 14, bold: true });
  });
  it("leaves stray or spaced asterisks as typed", () => {
    for (const s of ["5 * 3 = 15", "* không", "a ** b", "giá *", "** **"]) expect(parseInline(s).text).toBe(s);
    expect(parseInline("ký tự \\*sao\\*").text).toBe("ký tự *sao*");
  });
});

describe("display + segments", () => {
  it("strips markers for excerpts", () => {
    expect(displayText("> **Ồ** không")).toBe("Ồ không");
    expect(displayText("***")).toBe("");
  });
  it("splits at format and highlight boundaries", () => {
    const { text, ranges } = parseInline("ab**cd**ef");
    expect(buildStyledSegments(text, ranges, [{ id: "h", charStart: 1, charEnd: 3 }])).toEqual([
      { text: "a", bold: false, italic: false, highlightId: null },
      { text: "b", bold: false, italic: false, highlightId: "h" },
      { text: "c", bold: true, italic: false, highlightId: "h" },
      { text: "d", bold: true, italic: false, highlightId: null },
      { text: "ef", bold: false, italic: false, highlightId: null },
    ]);
  });
  it("returns one plain segment for unformatted text", () => {
    expect(buildStyledSegments("xin chào", [])).toEqual([{ text: "xin chào", bold: false, italic: false, highlightId: null }]);
  });
});
