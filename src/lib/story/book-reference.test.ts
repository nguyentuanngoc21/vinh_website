import { describe, expect, it } from "vitest";
import { bookReferenceColumn } from "./book-reference";

describe("book references", () => {
  it("queries immutable IDs for new story and reading links", () => {
    expect(bookReferenceColumn("550e8400-e29b-41d4-a716-446655440000")).toBe("id");
    expect(bookReferenceColumn("550E8400-E29B-41D4-A716-446655440000")).toBe("id");
  });
  it("preserves old slug links and never passes malformed IDs to a UUID column", () => {
    expect(bookReferenceColumn("ten-truyen-cu-123456")).toBe("slug");
    expect(bookReferenceColumn("550e8400-e29b-41d4-a716-invalidvalue")).toBe("slug");
  });
});
