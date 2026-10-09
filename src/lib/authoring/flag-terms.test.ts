import { describe, expect, it } from "vitest";
import { findFlaggedTerms } from "./flag-terms";

describe("findFlaggedTerms", () => {
  const terms = [{ term: "máu me", note: "Cân nhắc nhãn 16+" }, { term: "chết", note: null }];
  it("counts whole-word, case-insensitive, diacritic-exact matches", () => {
    expect(findFlaggedTerms("Máu me khắp nơi. Hắn chết. CHẾT thật. Chệt không tính. chếttt", terms)).toEqual([
      { term: "chết", note: null, count: 2 }, { term: "máu me", note: "Cân nhắc nhãn 16+", count: 1 },
    ]);
  });
  it("finds decomposed text and returns nothing for clean text", () => {
    expect(findFlaggedTerms("hắn chết".normalize("NFD"), terms)).toHaveLength(1);
    expect(findFlaggedTerms("Trời trong xanh.", terms)).toEqual([]);
    expect(findFlaggedTerms("chết", [])).toEqual([]);
  });
});
