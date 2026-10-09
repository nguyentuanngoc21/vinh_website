import { describe, expect, it } from "vitest";
import { buildQuickItems, foldVietnamese, parseTermInput, suggestAt, type StoryTerm } from "./story-terms";

const term = (o: Partial<StoryTerm>): StoryTerm => ({ id: "t1", kind: "place", name: "Tỉnh Lâm Khư", aliases: null, description: null, pinned: false, ...o });

describe("parseTermInput", () => {
  it("validates like the DB constraints", () => {
    expect(parseTermInput({ name: "  " }, true).error).toBeTruthy();
    expect(parseTermInput({ name: "x".repeat(61) }, true).error).toBeTruthy();
    expect(parseTermInput({ name: "A", kind: "planet" }, true).error).toBeTruthy();
    expect(parseTermInput({ pinned: "yes" }, false).error).toBeTruthy();
    expect(parseTermInput({}, false).error).toBeTruthy();
    expect(parseTermInput({ name: " Ngân  Hà ", kind: "place", aliases: "" }, true).data).toEqual({ name: "Ngân Hà", kind: "place", aliases: null });
  });
});

describe("quick items", () => {
  it("merges characters and terms, skips archived and quoted aliases, puts pinned first", () => {
    const items = buildQuickItems(
      [{ id: "c1", name: "Lâu Lâm", aliases: "\"hắn\", Lâm ca", story_role: "supporting" },
       { id: "c2", name: "Cũ", aliases: null, archived_at: "2026-01-01" }],
      [term({ pinned: true }), term({ id: "t2", name: "PT667", kind: "item" })],
    );
    expect(items.map(i => i.text)).toEqual(["Tỉnh Lâm Khư", "Lâm ca", "Lâu Lâm", "PT667"]);
  });
  it("orders by recent use after pins", () => {
    const items = buildQuickItems([{ id: "a", name: "An", aliases: null }, { id: "b", name: "Bình", aliases: null }], [],
      { "c:b": { count: 1, last: 100 } });
    expect(items[0].text).toBe("Bình");
  });
});

describe("suggestAt", () => {
  const items = buildQuickItems([{ id: "c1", name: "Lâu Lâm", aliases: null }, { id: "c2", name: "Khương Dịch Hành", aliases: null }],
    [term({ name: "Tỉnh Hàng Thổ" })]);
  it("folds case/diacritics and spans several words", () => {
    expect(foldVietnamese("Đông Lầu")).toBe("dong lau");
    const text = "Hôm ấy lau l";
    expect(suggestAt(text, text.length, items).map(s => [s.item.text, s.replaceFrom])).toEqual([["Lâu Lâm", 7]]);
    const t2 = "Thấy Khương";
    expect(suggestAt(t2, t2.length, items)[0]).toMatchObject({ item: { text: "Khương Dịch Hành" }, replaceFrom: 5 });
  });
  it("needs 2 characters and the caret at the end of a word", () => {
    expect(suggestAt("L", 1, items)).toEqual([]);
    expect(suggestAt("Lâu ", 4, items)).toEqual([]);
    expect(suggestAt("Lâu Lâm", 7, items)).toEqual([]);
    expect(suggestAt("Lâu Lâm, ", 9, items)).toEqual([]);
  });
});
