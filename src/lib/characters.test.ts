import { describe, expect, it } from "vitest";
import { parseCharacterIds, parseCharacterInput } from "./characters";

const id = "00000000-0000-4000-8000-000000000001";
describe("character validation", () => {
  it("rejects an entire malformed list rather than silently removing its members", () => {
    expect(parseCharacterIds([id, 7])).toBeNull();
    expect(parseCharacterIds(["bad-id"])).toBeNull();
    expect(parseCharacterIds(null)).toBeNull();
    expect(parseCharacterIds(Array(501).fill(id))).toBeNull();
    expect(parseCharacterIds([])).toEqual([]);
    expect(parseCharacterIds([id, id])).toEqual([id]);
  });
  it("requires a nonblank name and never truncates long input", () => {
    expect(parseCharacterInput({ name: "  " }, true).error).toBeTruthy();
    expect(parseCharacterInput({ name: "x".repeat(61) }, true).error).toBeTruthy();
    expect(parseCharacterInput({ name: "Valid", trope: "x".repeat(41) }, true).error).toBeTruthy();
    expect(parseCharacterInput({ name: " An ", trope: "  " }, true).data).toEqual({ name: "An", trope: null });
  });
  it("rejects malformed updates and invalid enum/boolean values", () => {
    for (const body of [null, [], {}, { name: "" }, { role: "toString" }, { role: 1 }, { story_role: "villain" }, { is_public: "true" }, { archived: 1 }]) {
      expect(parseCharacterInput(body, false).error).toBeTruthy();
    }
  });
  it("accepts private notes but ignores ownership and caller-provided archive timestamps", () => {
    expect(parseCharacterInput({ name: "An", private_notes: "secret", book_id: id, archived_at: "2020-01-01" }, true).data)
      .toEqual({ name: "An", private_notes: "secret" });
    expect(parseCharacterInput({ archived: false }, false).data).toEqual({ archived_at: null });
    expect(parseCharacterInput({ archived: true }, false).data?.archived_at).toBeTruthy();
  });
  it("only accepts HTTPS image URLs without credentials", () => {
    for (const avatar_url of ["javascript:alert(1)", "http://example.com/a.png", "https://user:pass@example.com/a.png", "invalid"]) {
      expect(parseCharacterInput({ avatar_url }, false).error).toBeTruthy();
    }
    expect(parseCharacterInput({ avatar_url: "https://example.com/a.png" }, false).data?.avatar_url).toBe("https://example.com/a.png");
  });
});
