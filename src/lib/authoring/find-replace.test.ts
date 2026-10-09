import { describe, expect, it } from "vitest";
import { findMatches, replaceMatches, type FindOptions } from "./find-replace";
import { tidyChapterText } from "./tidy-text";

const exact: FindOptions = { matchCase: true, matchDiacritics: true, wholeWord: false };
const loose: FindOptions = { matchCase: false, matchDiacritics: false, wholeWord: false };
const slice = (t: string, o: FindOptions, q: string) => findMatches(t, q, o).map(m => t.slice(m.start, m.end));

describe("findMatches", () => {
  it("is exact by default options", () => {
    expect(slice("Lâu Lâm, lâu lâm, Lầu Lâm", exact, "Lâu Lâm")).toEqual(["Lâu Lâm"]);
  });
  it("ignores case and diacritics but returns original slices", () => {
    expect(slice("Lâu Lâm, lâu lâm, Lầu Lâm, Đông", loose, "lau lam")).toEqual(["Lâu Lâm", "lâu lâm", "Lầu Lâm"]);
    expect(slice("Đông và đông", loose, "dong")).toEqual(["Đông", "đông"]);
  });
  it("finds in decomposed text with offsets valid for the NFC text", () => {
    expect(slice("Lâu Lâm".normalize("NFC"), loose, "LÂU".normalize("NFD"))).toEqual(["Lâu"]);
  });
  it("supports whole words", () => {
    const o = { ...exact, wholeWord: true };
    expect(slice("An, Anh, Bình An", o, "An")).toEqual(["An", "An"]);
  });
  it("replaces all matches in one pass", () => {
    const t = "Lâu Lâm cười. lâu lâm đi.";
    expect(replaceMatches(t, findMatches(t, "lâu lâm", loose), "Lâm Khư")).toBe("Lâm Khư cười. Lâm Khư đi.");
    expect(findMatches(t, "", loose)).toEqual([]);
  });
});

describe("tidyChapterText", () => {
  it("fixes spacing around punctuation and inside lines", () => {
    expect(tidyChapterText("  Hắn   cười ,rồi  nói : “ Đi thôi ” !  ").text).toBe("Hắn cười, rồi nói: “Đi thôi”!");
  });
  it("keeps numbers, markers and URLs intact", () => {
    const t = "Giá 3,5 lúc 10:30.\n\n[[thiet-ke:abc-123]]\n\nXem https://a.b/c?x=1,y";
    expect(tidyChapterText(t).text).toBe(t);
  });
  it("collapses extra blank lines and can split single-line paragraphs", () => {
    expect(tidyChapterText("A\n\n\n\nB\r\nC").text).toBe("A\n\nB\nC");
    expect(tidyChapterText("A\nB\n\nC", { linesAsParagraphs: true }).text).toBe("A\n\nB\n\nC");
  });
  it("reports whether anything changed", () => {
    expect(tidyChapterText("Đã gọn.").changed).toBe(false);
  });
});
