import { describe, expect, it } from "vitest";
import { applyNameFixes, findNameIssues, namesFrom } from "./name-check";
import { diffParagraphs, diffStats } from "./paragraph-diff";

describe("namesFrom", () => {
  it("collects names and plain aliases, skipping archived and quoted ones", () => {
    expect(namesFrom([{ name: "Lâu Lâm", aliases: "\"hắn\", Lâm ca" }, { name: "Cũ", aliases: null, archived_at: "x" }],
      [{ name: "Tỉnh Lâm Khư", aliases: null }])).toEqual(["Lâu Lâm", "Lâm ca", "Tỉnh Lâm Khư"]);
  });
});

describe("findNameIssues", () => {
  const names = ["Lâu Lâm", "Lâu Lâm Khư"];
  it("reports diacritic, case and unicode variants with positions", () => {
    const text = `Lầu Lâm đến. lâu lâm cười. ${"Lâu Lâm".normalize("NFD")} đi. Lâu Lâm ngồi.`;
    const issues = findNameIssues(text, names);
    expect(issues.map(i => [i.found.normalize("NFC"), i.kind, i.positions.length])).toEqual([
      ["Lầu Lâm", "diacritics", 1], ["lâu lâm", "case", 1], ["Lâu Lâm", "unicode", 1],
    ]);
  });
  it("lets a longer name claim its text first", () => {
    expect(findNameIssues("Lâu Lâm Khư và lầu lâm khư", names).map(i => [i.found, i.expected])).toEqual([["lầu lâm khư", "Lâu Lâm Khư"]]);
  });
  it("does not flag another registered spelling or partial words", () => {
    expect(findNameIssues("Lầu Lâm và Lâu Lâm", ["Lâu Lâm", "Lầu Lâm"])).toEqual([]);
    expect(findNameIssues("Lâu Lâmxyz", ["Lâu Lâm"])).toEqual([]);
  });
  it("fixes every position at once", () => {
    const text = "Lầu Lâm đến, rồi lầu lâm đi.";
    expect(applyNameFixes(text, findNameIssues(text, names))).toBe("Lâu Lâm đến, rồi Lâu Lâm đi.");
  });
});

describe("diffParagraphs", () => {
  it("marks added and removed paragraphs", () => {
    const parts = diffParagraphs("A\n\nB\n\nC", "A\n\nB2\n\nC\n\nD");
    expect(parts).toEqual([
      { kind: "same", text: "A" }, { kind: "removed", text: "B" }, { kind: "added", text: "B2" },
      { kind: "same", text: "C" }, { kind: "added", text: "D" },
    ]);
    expect(diffStats(parts)).toEqual({ added: 2, removed: 1 });
  });
  it("returns all-same for identical text", () => {
    expect(diffStats(diffParagraphs("A\n\nB", "A\n\nB"))).toEqual({ added: 0, removed: 0 });
  });
});
