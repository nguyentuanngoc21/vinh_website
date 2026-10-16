import { beforeEach, expect, it, vi } from "vitest";
const { context, single, eq, download } = vi.hoisted(() => ({ context: vi.fn(), single: vi.fn(), eq: vi.fn(), download: vi.fn() }));
vi.mock("@/lib/mobile/request-context", () => ({ getUserContext: context, requestError: () => Response.json({}, { status: 503 }) }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimits: () => ({ ok: true }) }));
import { GET } from "./route";
const id = "71000000-0000-4000-8000-000000000001";
const call = () => GET(new Request("http://localhost/"), { params: Promise.resolve({ jobId: id }) });
beforeEach(() => {
  vi.clearAllMocks();
  const chain = { eq, maybeSingle: single }; eq.mockReturnValue(chain);
  context.mockResolvedValue({ userId: "viewer", admin: () => ({ from: () => ({ select: () => chain }), storage: { from: () => ({ download }) } }) });
  single.mockResolvedValue({ data: { status: "queued", expires_at: "2099-01-01" }, error: null });
});
it("scopes every read to the verified owner and does not expose storage paths", async () => {
  const response = await call();
  expect(eq).toHaveBeenCalledWith("owner_id", "viewer");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ status: "queued" });
});
it("returns 404 without downloading when owner-scoped query finds nothing", async () => {
  single.mockResolvedValue({ data: null, error: null });
  expect((await call()).status).toBe(404); expect(download).not.toHaveBeenCalled();
});
it("does not serve expired content", async () => {
  single.mockResolvedValue({ data: { status: "succeeded", expires_at: "2000-01-01" } });
  expect((await call()).status).toBe(410); expect(download).not.toHaveBeenCalled();
});
it("requires authentication", async () => {
  context.mockResolvedValue({ userId: null });
  expect((await call()).status).toBe(401); expect(single).not.toHaveBeenCalled();
});
