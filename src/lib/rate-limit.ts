/**
 * In-memory, best-effort rate limiter — no Redis/Upstash in this project
 * (see package.json). Good enough to blunt casual abuse of the real-time
 * signup-check endpoint and the register endpoint's CCCD-dedupe check
 * (see check-availability/route.ts and auth/register/route.ts), but state
 * is per server instance and resets on redeploy/cold start — it is NOT a
 * substitute for a shared store if this ever needs to hold up under
 * distributed abuse.
 */

const buckets = new Map<string, { count: number; resetAt: number }>();

/** Returns true if `key` is still under `limit` calls per `windowMs`. */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= limit) {
    return false;
  }

  bucket.count += 1;
  return true;
}

/** Best-effort client IP from the headers Vercel/Next set on the request. */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
