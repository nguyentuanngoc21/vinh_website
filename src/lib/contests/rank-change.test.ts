import { describe, expect, it } from "vitest";
import { rankChange, rankChangeAria, rankChangeText } from "./rank-change";
import { vnDateKey } from "./datetime";

describe("rankChange", () => {
  it("lên / xuống / giữ hạng so với bản chụp", () => {
    expect(rankChange(5, 2)).toEqual({ direction: "up", by: 3 });
    expect(rankChange(1, 4)).toEqual({ direction: "down", by: 3 });
    expect(rankChange(2, 2)).toEqual({ direction: "same", by: 0 });
  });

  it("chưa có trong bản chụp → Mới", () => {
    expect(rankChange(undefined, 7)).toEqual({ direction: "new" });
  });

  it("nhãn hiển thị và nhãn đọc màn hình", () => {
    expect(rankChangeText({ direction: "up", by: 2 })).toBe("▲ 2");
    expect(rankChangeText({ direction: "down", by: 1 })).toBe("▼ 1");
    expect(rankChangeText({ direction: "same", by: 0 })).toBe("—");
    expect(rankChangeText({ direction: "new" })).toBe("Mới");
    expect(rankChangeAria({ direction: "down", by: 1 })).toBe("Giảm 1 hạng so với hôm qua");
  });
});

describe("vnDateKey", () => {
  it("đổi ngày theo giờ Việt Nam (GMT+7), không theo UTC", () => {
    // 17:05 UTC ngày 20 = 00:05 giờ VN ngày 21 (lúc cron chụp hạng).
    const at = new Date("2026-10-20T17:05:00Z");
    expect(vnDateKey(at)).toBe("2026-10-21");
    expect(vnDateKey(at, -1)).toBe("2026-10-20");
    expect(vnDateKey(new Date("2026-10-20T16:59:00Z"))).toBe("2026-10-20");
  });
});
