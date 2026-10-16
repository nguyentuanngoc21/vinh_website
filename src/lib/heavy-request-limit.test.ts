import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: () => ({ rpc }) }));
import { limitHeavyRequest } from "./heavy-request-limit";
import { resetRateLimitsForTests } from "./rate-limit";
beforeEach(() => {
  vi.unstubAllEnvs(); vi.clearAllMocks(); resetRateLimitsForTests();
  vi.stubEnv("HEAVY_REQUEST_LIMIT_STORE", "memory");
});

describe("heavy request limits", () => {
  it("isolates accounts/scopes and returns 429 without touching the shared store in memory mode", async () => {
    for (let i = 0; i < 5; i++) expect(await limitHeavyRequest("A", "identity-ocr")).toBeNull();
    const response = await limitHeavyRequest("A", "identity-ocr");
    expect(response?.status).toBe(429);
    expect(Number(response?.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(response?.headers.get("cache-control")).toBe("private, no-store");
    expect(await limitHeavyRequest("B", "identity-ocr")).toBeNull();
    expect(await limitHeavyRequest("A", "manuscript-extract")).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("uses the atomic RPC in shared mode with verified identity and server-side limits", async () => {
    vi.stubEnv("HEAVY_REQUEST_LIMIT_STORE", "supabase");
    rpc.mockResolvedValue({ data: [{ allowed: true, retry_after_seconds: 0 }], error: null });
    expect(await limitHeavyRequest("A", "audio-upload")).toBeNull();
    expect(rpc).toHaveBeenCalledWith("consume_heavy_request_limit", {
      p_subject: "A", p_scope: "audio-upload", p_limit: 30, p_window_seconds: 600,
    });
  });
  it("honors the shared store retry interval", async () => {
    vi.stubEnv("HEAVY_REQUEST_LIMIT_STORE", "supabase");
    rpc.mockResolvedValue({ data: [{ allowed: false, retry_after_seconds: 82 }], error: null });
    const response = await limitHeavyRequest("A", "audio-upload");
    expect(response?.status).toBe(429);
    expect(response?.headers.get("retry-after")).toBe("82");
  });
  it("does not silently fall back to memory for a misspelled store setting", async () => {
    vi.stubEnv("HEAVY_REQUEST_LIMIT_STORE", "supabse");
    expect((await limitHeavyRequest("A", "audio-upload"))?.status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([
    { data: null, error: { message: "missing migration" } },
    { data: [], error: null },
    { data: [{ allowed: "bad", retry_after_seconds: 0 }], error: null },
  ])("fails closed when the shared store is unavailable or invalid", async result => {
    vi.stubEnv("HEAVY_REQUEST_LIMIT_STORE", "supabase");
    rpc.mockResolvedValue(result);
    const response = await limitHeavyRequest("A", "identity-ocr");
    expect(response?.status).toBe(503);
    expect(response?.headers.get("retry-after")).toBe("30");
  });
});
