import { describe, expect, it } from "vitest";
import { createHistory, GROUP_MS, HISTORY_LIMIT, record, redo, undo, type TextHistory } from "./text-history";

const sel = (n: number) => ({ start: n, end: n });
const type = (h: TextHistory, value: string, at: number) => record(h, { value, selection: sel(value.length) }, "type", at);

describe("text history", () => {
  it("groups a typing burst into one undo step", () => {
    let h = createHistory("");
    h = type(h, "a", 0); h = type(h, "ab", 100); h = type(h, "abc", 200);
    expect(undo(h)?.present.value).toBe("");
  });
  it("splits steps after a pause or a new line", () => {
    let h = createHistory("");
    h = type(h, "a", 0); h = type(h, "ab", GROUP_MS + 1);
    expect(undo(h)?.present.value).toBe("a");
    h = type(h, "ab\n", GROUP_MS + 50); h = type(h, "ab\nc", GROUP_MS + 100);
    expect(undo(h)?.present.value).toBe("ab\n");
  });
  it("keeps every toolbar edit as its own step", () => {
    let h = createHistory("x");
    h = record(h, { value: "**x**", selection: sel(2) }, "edit", 0);
    h = record(h, { value: "## **x**", selection: sel(5) }, "edit", 10);
    expect(undo(h)?.present.value).toBe("**x**");
  });
  it("redoes until a new change clears the redo stack", () => {
    let h = createHistory("a");
    h = record(h, { value: "ab", selection: sel(2) }, "edit", 0);
    const back = undo(h)!;
    expect(redo(back)?.present).toEqual({ value: "ab", selection: sel(2) });
    const branched = record(back, { value: "ac", selection: sel(2) }, "edit", 5);
    expect(redo(branched)).toBeNull();
  });
  it("returns null at either end and caps the stack", () => {
    expect(undo(createHistory("a"))).toBeNull();
    expect(redo(createHistory("a"))).toBeNull();
    let h = createHistory("");
    for (let i = 1; i <= HISTORY_LIMIT + 50; i++) h = record(h, { value: "x".repeat(i), selection: sel(i) }, "edit", i);
    expect(h.past.length).toBe(HISTORY_LIMIT);
  });
  it("ignores selection-only updates as history steps", () => {
    const h = record(createHistory("abc"), { value: "abc", selection: sel(1) }, "type", 0);
    expect(h.past).toHaveLength(0);
    expect(h.present.selection).toEqual(sel(1));
  });
});
