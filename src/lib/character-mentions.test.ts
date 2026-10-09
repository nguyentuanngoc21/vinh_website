import { describe, expect, it } from "vitest";
import { createMentionMatcher, parseMentionTerms } from "./character-mentions";

const match = (name: string, aliases: string | null, text: string, others: [string, string | null][] = []) =>
  createMentionMatcher(parseMentionTerms(name, aliases), others.flatMap(([n, a]) => parseMentionTerms(n, a)))(text);

describe("parseMentionTerms", () => {
  it("splits aliases, trims, dedupes and keeps quoted terms apart", () => {
    expect(parseMentionTerms("Lâu Lâm", ` "hắn" , Lâm ca; Lâu Lâm\n“hắn”`)).toEqual([
      { text: "Lâu Lâm", quoted: false }, { text: "hắn", quoted: true }, { text: "Lâm ca", quoted: false },
    ]);
  });
  it("normalizes decomposed Unicode and collapses spaces", () => {
    expect(parseMentionTerms("Lâu  Lâm".normalize("NFD"), null)).toEqual([{ text: "Lâu Lâm", quoted: false }]);
  });
  it("treats a one-sided quote as a plain term", () => {
    expect(parseMentionTerms("\"hắn", null)).toEqual([{ text: "hắn", quoted: false }]);
  });
});

describe("createMentionMatcher", () => {
  it("is case- and diacritic-exact", () => {
    expect(match("Ngân Hà", null, "Nhìn lên ngân hà rực rỡ.")).toBeNull();
    expect(match("Lâu Lâm", null, "Lầu Lâm đứng dậy.")).toBeNull();
    expect(match("Ngân Hà", null, "Ngân Hà cười. Ngân Hà đi.")?.count).toBe(2);
  });
  it("matches whole words only", () => {
    expect(match("An", null, "Anh ấy về. Bình An đến.")?.count).toBe(1);
    expect(match("An", null, "Anh ấy về.")).toBeNull();
  });
  it("matches a quoted term only when the text has it quoted, in any quote style", () => {
    expect(match("Lâu Lâm", `"hắn"`, "hắn đi rồi.")).toBeNull();
    expect(match("Lâu Lâm", `"hắn"`, `Gọi “hắn” là được. «hắn» sao? "hắn"`)?.count).toBe(3);
  });
  it("matches decomposed chapter text and names split by line breaks or non-breaking spaces", () => {
    expect(match("Lâu Lâm", null, "Lâu Lâm đến.".normalize("NFD"))?.count).toBe(1);
    expect(match("Lâu Lâm", null, "Lâu Lâm và Lâu\nLâm")?.count).toBe(2);
  });
  it("credits a match inside another character's longer name to that character", () => {
    const others: [string, string | null][] = [["Khương Dịch Hành", null]];
    expect(match("Khương Dịch", null, "Khương Dịch Hành rút kiếm.", others)).toBeNull();
    expect(match("Khương Dịch", null, "Khương Dịch Hành và Khương Dịch.", others)?.count).toBe(1);
  });
  it("reports first position, distinct matched forms and a snippet", () => {
    const r = match("Lâu Lâm", "Lâm ca", `${"x ".repeat(40)}Lâm ca gật đầu. Lâu Lâm cười.`);
    expect(r).toMatchObject({ count: 2, matched: ["Lâm ca", "Lâu Lâm"] });
    expect(r?.snippet.startsWith("…")).toBe(true);
    expect(r?.snippet).toContain("Lâm ca gật đầu");
  });
  it("escapes regex characters in names", () => {
    expect(match("A.B (C)", null, "Gặp A.B (C) ở đây; AxB (C) thì không.")?.count).toBe(1);
  });
});
