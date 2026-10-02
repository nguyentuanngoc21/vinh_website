import { describe, expect, it } from "vitest";
import { validateContentReport } from "./content-reports";
const valid = { bookId: "12345678-1234-1234-1234-123456789012", reason: "plagiarism", description: "Đoạn văn giống tác phẩm gốc." };
describe("content report validation", () => {
  it("accepts reports without an evidence URL and trims text", () => {
    expect(validateContentReport({ ...valid, description: ` ${valid.description} ` }).value?.description).toBe(valid.description);
  });
  it("accepts age rating reports and chapter targets", () => {
    expect(validateContentReport({ ...valid, reason: "age_rating", chapterId: valid.bookId, evidenceUrl: "https://example.com/source" }).value?.reason).toBe("age_rating");
  });
  it.each([null, {}, { ...valid, bookId: "bad" }, { ...valid, chapterId: 3 }, { ...valid, reason: "toString" }, { ...valid, reason: "unknown" }, { ...valid, description: "short" }, { ...valid, description: "a".repeat(3001) }, { ...valid, evidenceUrl: "javascript:alert(1)" }, { ...valid, evidenceUrl: "https://user:secret@example.com" }])("rejects malformed or unsafe input %#", body => {
    expect(validateContentReport(body).error).toBeTruthy();
  });
});
