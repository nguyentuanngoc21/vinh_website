import { describe, expect, it } from "vitest";
import { DEFAULT_TOOLBAR, moveItem, normalizeToolbar, toggleHidden, TOOLBAR_ITEMS, visibleItems } from "./toolbar-prefs";

describe("toolbar prefs", () => {
  it("drops unknown/duplicate ids and appends new buttons", () => {
    const p = normalizeToolbar({ order: ["find", "bogus", "find", "undo"], hidden: ["keys", 3] });
    expect(p.order.slice(0, 2)).toEqual(["find", "undo"]);
    expect(p.order).toHaveLength(TOOLBAR_ITEMS.length);
    expect(p.hidden).toEqual(["keys"]);
    expect(normalizeToolbar(null)).toEqual(DEFAULT_TOOLBAR);
  });
  it("moves within bounds and toggles visibility", () => {
    expect(moveItem(DEFAULT_TOOLBAR, "redo", -1).order.slice(0, 2)).toEqual(["redo", "undo"]);
    expect(moveItem(DEFAULT_TOOLBAR, "undo", -1)).toBe(DEFAULT_TOOLBAR);
    const hidden = toggleHidden(DEFAULT_TOOLBAR, "image");
    expect(hidden.hidden).toEqual(["image"]);
    expect(toggleHidden(hidden, "image").hidden).toEqual([]);
  });
  it("shows only available, non-hidden items in order", () => {
    const p = toggleHidden(moveItem(DEFAULT_TOOLBAR, "find", -1), "bold");
    expect(visibleItems(p, ["undo", "bold", "find", "image", "tidy"])).toEqual(["undo", "find", "image", "tidy"]);
  });
});
