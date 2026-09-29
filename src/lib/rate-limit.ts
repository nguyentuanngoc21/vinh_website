/**
 * In-memory, best-effort rate limiter — no Redis/Upstash in this project
 * (see package.json). Good enough to blunt casual abuse of the real-time
 * signup-check endpoint, the register endpoint's CCCD-dedupe check and the
 * pre-sign-in auth routes (login, OTP verify/resend, forgot/reset password),
 * but state is per server instance and resets on redeploy/cold start — on
 * Vercel mỗi instance có Map riêng, nên giới hạn thực tế có thể cao hơn con
 * số khai báo khi traffic dàn qua nhiều instance. It is NOT a substitute for
 * a shared store if this ever needs to hold up under distributed abuse
 * (Supabase GoTrue's own limits remain the backstop).
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Dọn bucket hết hạn khi Map phình to — không có timer nền (serverless),
// nên quét lười ngay trong lượt gọi, tránh Map tăng vô hạn theo số IP/email.
const SWEEP_THRESHOLD = 10_000;

function sweepExpired(now: number) {
  if (buckets.size < SWEEP_THRESHOLD) return;
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

export type RateLimitRule = { key: string; limit: number; windowMs: number };

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

function liveBucket(key: string, now: number): Bucket | undefined {
  const bucket = buckets.get(key);
  if (!bucket) return undefined;
  if (now >= bucket.resetAt) {
    buckets.delete(key);
    return undefined;
  }
  return bucket;
}

/**
 * Chỉ kiểm tra, KHÔNG tính lượt: trả về bị chặn nếu BẤT KỲ rule nào đã chạm
 * limit (retryAfterSec = lâu nhất trong các rule đang chặn). Dùng cho route
 * chỉ muốn đếm lượt THẤT BẠI (login, verify-otp) — xem recordRateLimitHit().
 */
export function peekRateLimits(rules: RateLimitRule[], now = Date.now()): RateLimitResult {
  let retryAfterMs = 0;
  for (const rule of rules) {
    const bucket = liveBucket(rule.key, now);
    if (bucket && bucket.count >= rule.limit) {
      retryAfterMs = Math.max(retryAfterMs, bucket.resetAt - now);
    }
  }
  if (retryAfterMs > 0) return { ok: false, retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  return { ok: true };
}

/** Tính thêm 1 lượt cho mọi rule (mở cửa sổ mới nếu bucket chưa có/đã hết hạn). */
export function recordRateLimitHit(rules: RateLimitRule[], now = Date.now()): void {
  sweepExpired(now);
  for (const rule of rules) {
    const bucket = liveBucket(rule.key, now);
    if (bucket) bucket.count += 1;
    else buckets.set(rule.key, { count: 1, resetAt: now + rule.windowMs });
  }
}

/**
 * Kiểm tra rồi tính lượt cho mọi rule trong một bước — nếu một rule đang chặn
 * thì KHÔNG rule nào bị tính thêm (request bị chặn không làm dài thêm/đầy
 * thêm bucket khác, ví dụ bucket theo email khi chỉ IP đang bị chặn).
 */
export function consumeRateLimits(rules: RateLimitRule[], now = Date.now()): RateLimitResult {
  const result = peekRateLimits(rules, now);
  if (result.ok) recordRateLimitHit(rules, now);
  return result;
}

/** Xoá bucket — ví dụ reset bộ đếm sai mật khẩu theo tài khoản sau khi đăng nhập thành công. */
export function clearRateLimit(key: string): void {
  buckets.delete(key);
}

/** Returns true if `key` is still under `limit` calls per `windowMs`. */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  return consumeRateLimits([{ key, limit, windowMs }]).ok;
}

/**
 * Chuẩn hoá email/tên tài khoản làm key: trim + lowercase, để "A@x.com" và
 * "a@x.com " không thành 2 bucket riêng (lách limit bằng cách đổi hoa/thường).
 */
export function normalizeRateLimitIdentifier(identifier: string): string {
  return identifier.trim().toLowerCase();
}

/** 429 + Retry-After, cùng shape `{ error }` với các lỗi khác của route auth. */
export function rateLimitedResponse(message: string, retryAfterSec: number): Response {
  return Response.json(
    { error: message },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
  );
}

/** Best-effort client IP from the headers Vercel/Next set on the request. */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/** Chỉ dùng trong unit test — xoá toàn bộ state giữa các test case. */
export function resetRateLimitsForTests(): void {
  buckets.clear();
}
