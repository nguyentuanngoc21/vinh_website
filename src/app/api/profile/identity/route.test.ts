import { beforeEach, expect, it, vi } from "vitest";
const { context, limit, ocr } = vi.hoisted(() => ({ context: vi.fn(), limit: vi.fn(), ocr: vi.fn() }));
vi.mock("@/lib/mobile/request-context", () => ({ getRequestContext: context, requestError: () => Response.json({}, { status: 503 }) }));
vi.mock("@/lib/heavy-request-limit", () => ({ limitHeavyRequest: limit }));
vi.mock("@/lib/ocr", () => ({ verifyCccdAgainstImages: ocr }));
import { POST } from "./route";
beforeEach(() => {
  vi.clearAllMocks(); context.mockResolvedValue({ client: {}, userId: "verified-user" });
  limit.mockResolvedValue(Response.json({}, { status: 429, headers: { "Retry-After": "60" } }));
});
it("blocks OCR before any image processing or storage writes", async () => {
  const form = new FormData(); form.set("cccd", "123456789012");
  form.set("cccdFront", new File(["image"], "front.jpg"));
  form.set("cccdBack", new File(["image"], "back.jpg"));
  const response = await POST(new Request("http://localhost/api/profile/identity", { method: "POST", body: form }));
  expect(response.status).toBe(429);
  expect(ocr).not.toHaveBeenCalled();
  expect(limit).toHaveBeenCalledWith("verified-user", "identity-ocr", expect.any(Function));
});
it("rejects guests before consuming account quota", async () => {
  context.mockResolvedValue({ userId: null });
  expect((await POST(new Request("http://localhost/", { method: "POST" }))).status).toBe(401);
  expect(limit).not.toHaveBeenCalled();
});
