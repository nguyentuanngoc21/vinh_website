import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { consumeRateLimits, rateLimitedResponse } from "@/lib/rate-limit";

// Initial operating limits, not measured capacity. Count per verified account, not shared IP.
export const HEAVY_REQUEST_LIMITS = {
  "audio-upload": { limit: 30, windowMs: 600_000 },
  "manuscript-extract": { limit: 6, windowMs: 600_000 },
  "identity-ocr": { limit: 5, windowMs: 600_000 },
} as const;

export async function limitHeavyRequest(
  userId: string,
  action: keyof typeof HEAVY_REQUEST_LIMITS,
  admin: () => SupabaseClient<Database> = () => createServiceRoleClient()
): Promise<Response | null> {
  const rule = HEAVY_REQUEST_LIMITS[action];
  const store = process.env.HEAVY_REQUEST_LIMIT_STORE;
  if (!store || store === "memory") {
    const result = consumeRateLimits([{ key: `heavy:${action}:${userId}`, ...rule }]);
    return result.ok ? null : rateLimitedResponse("Bạn thao tác quá nhiều lần. Vui lòng thử lại sau.", result.retryAfterSec);
  }
  try {
    if (store !== "supabase") throw new Error("Invalid rate limit store configuration");
    const { data, error } = await admin().rpc("consume_heavy_request_limit", {
      p_subject: userId, p_scope: action, p_limit: rule.limit, p_window_seconds: rule.windowMs / 1000,
    });
    const result = data?.[0];
    if (error || !result || typeof result.allowed !== "boolean" || !Number.isFinite(result.retry_after_seconds)) {
      throw new Error("Rate limit store unavailable");
    }
    return result.allowed ? null : rateLimitedResponse("Bạn thao tác quá nhiều lần. Vui lòng thử lại sau.", Math.max(1, result.retry_after_seconds));
  } catch {
    // Never silently bypass the shared guard when the RPC/store fails.
    return Response.json({ error: "Tạm thời chưa xử lý được. Vui lòng thử lại sau." }, {
      status: 503, headers: { "Retry-After": "30", "Cache-Control": "private, no-store" },
    });
  }
}
