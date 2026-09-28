import { describe, expect, it } from "vitest";
import { truncateWords } from "./truncate-words";

describe("truncateWords", () => {
  it("giữ nguyên khi không vượt giới hạn", () => {
    expect(truncateWords("Mười hai mùa gió", 60)).toBe("Mười hai mùa gió");
  });

  it("đúng bằng giới hạn thì không thêm ...", () => {
    expect(truncateWords("một hai ba", 3)).toBe("một hai ba");
  });

  it("vượt giới hạn thì cắt theo chữ và thêm ...", () => {
    expect(truncateWords("một hai ba bốn năm", 3)).toBe("một hai ba...");
  });

  it("gộp khoảng trắng/xuống dòng thừa", () => {
    expect(truncateWords("  một\n\nhai   ba  ", 60)).toBe("một hai ba");
  });

  it("bỏ dấu câu dính cuối trước ...", () => {
    expect(truncateWords("một, hai, ba, bốn", 2)).toBe("một, hai...");
  });

  it("đếm đúng 60 chữ", () => {
    const text = Array.from({ length: 75 }, (_, i) => `c${i}`).join(" ");
    const out = truncateWords(text, 60);
    expect(out.endsWith("c59...")).toBe(true);
    expect(out.split(" ")).toHaveLength(60);
  });
});
