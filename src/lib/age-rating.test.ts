import { describe, expect, it } from "vitest";
import { minRatingForWarnings, normalizeAgeRating, ratingAtLeast } from "@/lib/age-rating";

describe("minRatingForWarnings", () => {
  it("không có cảnh báo → mọi lứa tuổi", () => {
    expect(minRatingForWarnings([])).toBe("all");
  });
  it("cảnh báo 16+ → 16", () => {
    expect(minRatingForWarnings(["violence", "horror"])).toBe("16");
  });
  it("có 1 cảnh báo 18+ → 18", () => {
    expect(minRatingForWarnings(["violence", "sexual_explicit"])).toBe("18");
  });
  it("bỏ qua id lạ", () => {
    expect(minRatingForWarnings(["khong_ton_tai"])).toBe("all");
  });
});

describe("normalizeAgeRating", () => {
  it("nâng độ tuổi lên mức cảnh báo yêu cầu", () => {
    expect(normalizeAgeRating("all", ["gore_extreme"])).toEqual({ ageRating: "18", contentWarnings: ["gore_extreme"] });
    expect(normalizeAgeRating("all", ["profanity"])).toEqual({ ageRating: "16", contentWarnings: ["profanity"] });
  });
  it("giữ độ tuổi cao hơn mức tối thiểu", () => {
    expect(normalizeAgeRating("18", ["violence"])).toEqual({ ageRating: "18", contentWarnings: ["violence"] });
    expect(normalizeAgeRating("16", [])).toEqual({ ageRating: "16", contentWarnings: [] });
  });
  it("bỏ trùng, bỏ id lạ, giữ thứ tự chuẩn", () => {
    expect(normalizeAgeRating("16", ["horror", "violence", "horror", "x"])).toEqual({
      ageRating: "16",
      contentWarnings: ["violence", "horror"],
    });
  });
  it("input sai kiểu → null", () => {
    expect(normalizeAgeRating("13", [])).toBeNull();
    expect(normalizeAgeRating("16", "violence")).toBeNull();
    expect(normalizeAgeRating("16", [1])).toBeNull();
  });
});

describe("ratingAtLeast", () => {
  it("so sánh thứ bậc", () => {
    expect(ratingAtLeast("18", "16")).toBe(true);
    expect(ratingAtLeast("all", "16")).toBe(false);
    expect(ratingAtLeast("16", "16")).toBe(true);
  });
});
