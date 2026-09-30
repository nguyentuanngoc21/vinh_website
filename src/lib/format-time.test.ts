import { describe, expect, it } from "vitest";
import { relativeTimeLabel } from "./format-time";

const NOW = Date.parse("2026-09-29T12:00:00Z");
const ago = (sec: number) => new Date(NOW - sec * 1000).toISOString();

describe("relativeTimeLabel", () => {
  it("dưới 1 phút là 'Vừa xong' (kể cả mốc tương lai do lệch giờ)", () => {
    expect(relativeTimeLabel(ago(0), NOW)).toBe("Vừa xong");
    expect(relativeTimeLabel(ago(59), NOW)).toBe("Vừa xong");
    expect(relativeTimeLabel(ago(-30), NOW)).toBe("Vừa xong");
  });
  it("phút / giờ / ngày / tuần / tháng", () => {
    expect(relativeTimeLabel(ago(5 * 60), NOW)).toBe("5 phút");
    expect(relativeTimeLabel(ago(3 * 3600), NOW)).toBe("3 giờ");
    expect(relativeTimeLabel(ago(2 * 86400), NOW)).toBe("2 ngày");
    expect(relativeTimeLabel(ago(9 * 86400), NOW)).toBe("1 tuần");
    expect(relativeTimeLabel(ago(28 * 86400), NOW)).toBe("4 tuần");
    expect(relativeTimeLabel(ago(90 * 86400), NOW)).toBe("3 tháng");
  });
  it("từ 1 năm trở lên hiện ngày đầy đủ", () => {
    expect(relativeTimeLabel("2025-01-15T12:00:00Z", NOW)).toMatch(/2025/);
  });
});
