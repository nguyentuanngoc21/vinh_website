import { describe, expect, it } from "vitest";
import {
  compareRanked,
  decodeFeedCursor,
  decodeRankingCursor,
  discoverSeed,
  encodeFeedCursor,
  encodeRankingCursor,
  type RankedRow,
} from "@/lib/contests/ranking";

const row = (id: string, value: number, submitted_at = "2026-10-02T00:00:00Z"): RankedRow => ({ submission_id: id, value, submitted_at });

describe("compareRanked (cùng thứ tự với get_contest_ranking)", () => {
  it("value giảm dần, rồi nộp sớm hơn, rồi id", () => {
    const rows = [row("c", 5), row("b", 9), row("a", 5), row("d", 5, "2026-10-01T00:00:00Z")];
    expect([...rows].sort(compareRanked).map((r) => r.submission_id)).toEqual(["b", "d", "a", "c"]);
  });

  it("tất định: sắp lại bao nhiêu lần cũng cùng thứ tự", () => {
    const rows = [row("x", 1), row("y", 1), row("z", 1)];
    const once = [...rows].sort(compareRanked);
    expect([...rows].reverse().sort(compareRanked)).toEqual(once);
  });
});

describe("cursor", () => {
  it("ranking: encode/decode giữ nguyên", () => {
    const c = { rank: 5, submitted_at: "2026-10-02T00:00:00Z", id: "abc" };
    expect(decodeRankingCursor(encodeRankingCursor(c))).toEqual(c);
  });

  it("ranking: không có cursor → null; cursor hỏng → invalid", () => {
    expect(decodeRankingCursor(null)).toBeNull();
    expect(decodeRankingCursor("không-phải-cursor")).toBe("invalid");
    expect(decodeRankingCursor(Buffer.from('{"rank":"x"}').toString("base64url"))).toBe("invalid");
    expect(decodeRankingCursor(Buffer.from('{"rank":0,"submitted_at":"2026-10-02T00:00:00Z","id":"a"}').toString("base64url"))).toBe("invalid");
  });

  it("feed: encode/decode giữ nguyên, hỏng → invalid", () => {
    const c = { key: "2026-10-02T00:00:00.000000Z", id: "abc" };
    expect(decodeFeedCursor(encodeFeedCursor(c))).toEqual(c);
    expect(decodeFeedCursor("@@")).toBe("invalid");
    expect(decodeFeedCursor(undefined)).toBeNull();
  });
});

describe("discoverSeed", () => {
  it("cố định trong ngày giờ Việt Nam, đổi khi sang ngày", () => {
    const a = discoverSeed("u1", new Date("2026-10-10T01:00:00Z"));
    expect(discoverSeed("u1", new Date("2026-10-10T16:00:00Z"))).toBe(a);
    expect(discoverSeed("u1", new Date("2026-10-10T17:00:00Z"))).not.toBe(a);
    expect(discoverSeed(null, new Date("2026-10-10T01:00:00Z"))).toBe("2026-10-10:anon");
  });
});
