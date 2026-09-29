import { beforeEach, describe, expect, it } from "vitest";
import {
  checkRateLimit,
  clearRateLimit,
  consumeRateLimits,
  getClientIp,
  normalizeRateLimitIdentifier,
  peekRateLimits,
  rateLimitedResponse,
  recordRateLimitHit,
  resetRateLimitsForTests,
} from "./rate-limit";

const MIN = 60_000;

beforeEach(() => resetRateLimitsForTests());

describe("consumeRateLimits", () => {
  it("cho qua đúng `limit` lượt rồi chặn, kèm retryAfterSec", () => {
    const rules = [{ key: "a", limit: 3, windowMs: 10 * MIN }];
    const t0 = 1_000_000;
    expect(consumeRateLimits(rules, t0).ok).toBe(true);
    expect(consumeRateLimits(rules, t0).ok).toBe(true);
    expect(consumeRateLimits(rules, t0).ok).toBe(true);
    expect(consumeRateLimits(rules, t0 + MIN)).toEqual({ ok: false, retryAfterSec: 9 * 60 });
  });

  it("mở cửa sổ mới khi hết hạn", () => {
    const rules = [{ key: "a", limit: 1, windowMs: MIN }];
    expect(consumeRateLimits(rules, 0).ok).toBe(true);
    expect(consumeRateLimits(rules, MIN - 1).ok).toBe(false);
    expect(consumeRateLimits(rules, MIN).ok).toBe(true);
  });

  it("một rule chặn thì không rule nào bị tính thêm lượt", () => {
    const ip = { key: "ip", limit: 1, windowMs: MIN };
    const email = { key: "email", limit: 2, windowMs: MIN };
    expect(consumeRateLimits([ip, email], 0).ok).toBe(true);
    expect(consumeRateLimits([ip, email], 0).ok).toBe(false);
    expect(consumeRateLimits([ip, email], 0).ok).toBe(false);
    // bucket email mới có 1 lượt, còn đúng 1 lượt nữa
    expect(consumeRateLimits([email], 0).ok).toBe(true);
    expect(consumeRateLimits([email], 0).ok).toBe(false);
  });

  it("retryAfterSec lấy rule chặn lâu nhất, tối thiểu 1 giây", () => {
    recordRateLimitHit([{ key: "short", limit: 1, windowMs: 500 }], 0);
    expect(peekRateLimits([{ key: "short", limit: 1, windowMs: 500 }], 0)).toEqual({
      ok: false,
      retryAfterSec: 1,
    });
    recordRateLimitHit([{ key: "long", limit: 1, windowMs: 5 * MIN }], 0);
    const result = peekRateLimits(
      [
        { key: "short", limit: 1, windowMs: 500 },
        { key: "long", limit: 1, windowMs: 5 * MIN },
      ],
      0
    );
    expect(result).toEqual({ ok: false, retryAfterSec: 300 });
  });
});

describe("peekRateLimits / recordRateLimitHit (chỉ đếm lượt thất bại)", () => {
  it("peek không tính lượt", () => {
    const rules = [{ key: "login", limit: 2, windowMs: MIN }];
    for (let i = 0; i < 10; i++) expect(peekRateLimits(rules, 0).ok).toBe(true);
    recordRateLimitHit(rules, 0);
    expect(peekRateLimits(rules, 0).ok).toBe(true);
    recordRateLimitHit(rules, 0);
    expect(peekRateLimits(rules, 0).ok).toBe(false);
  });

  it("clearRateLimit xoá bộ đếm của đúng key đó", () => {
    const id = { key: "id", limit: 1, windowMs: MIN };
    const ip = { key: "ip", limit: 1, windowMs: MIN };
    recordRateLimitHit([id, ip], 0);
    clearRateLimit("id");
    expect(peekRateLimits([id], 0).ok).toBe(true);
    expect(peekRateLimits([ip], 0).ok).toBe(false);
  });
});

describe("checkRateLimit (API cũ)", () => {
  it("giữ nguyên hành vi boolean", () => {
    expect(checkRateLimit("k", 2, MIN)).toBe(true);
    expect(checkRateLimit("k", 2, MIN)).toBe(true);
    expect(checkRateLimit("k", 2, MIN)).toBe(false);
  });
});

describe("normalizeRateLimitIdentifier", () => {
  it("trim + lowercase", () => {
    expect(normalizeRateLimitIdentifier("  User@Example.COM ")).toBe("user@example.com");
  });
});

describe("rateLimitedResponse", () => {
  it("trả 429, Retry-After và body { error }", async () => {
    const res = rateLimitedResponse("Chậm lại.", 42);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect(await res.json()).toEqual({ error: "Chậm lại." });
  });
});

describe("getClientIp", () => {
  it("lấy IP đầu tiên của x-forwarded-for, rồi x-real-ip, rồi 'unknown'", () => {
    const req = (headers: Record<string, string>) => new Request("http://x", { headers });
    expect(getClientIp(req({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("1.1.1.1");
    expect(getClientIp(req({ "x-real-ip": "3.3.3.3" }))).toBe("3.3.3.3");
    expect(getClientIp(req({}))).toBe("unknown");
  });
});
