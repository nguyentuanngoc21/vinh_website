import { beforeEach, expect, it, vi } from "vitest";
const { getUserContext, limit, extractRawText } = vi.hoisted(() => ({ getUserContext: vi.fn(), limit: vi.fn(), extractRawText: vi.fn() }));
vi.mock("@/lib/mobile/request-context", () => ({ getUserContext, requestError: () => Response.json({}, { status: 503 }) }));
vi.mock("@/lib/heavy-request-limit", () => ({ limitHeavyRequest: limit }));
vi.mock("mammoth", () => ({ default: { extractRawText } }));
import { POST } from "./route";
beforeEach(() => {
  vi.clearAllMocks();
  getUserContext.mockResolvedValue({ userId: "verified-user", admin: () => ({}) });
  limit.mockResolvedValue(Response.json({}, { status: 429, headers: { "Retry-After": "60" } }));
});
it("blocks expensive DOCX parsing before reading/converting the file", async () => {
  const form = new FormData();
  form.set("file", new File(["docx fixture"], "book.docx"));
  const response = await POST(new Request("http://localhost/api/authoring/manuscripts/extract", { method: "POST", body: form }));
  expect(response.status).toBe(429);
  expect(extractRawText).not.toHaveBeenCalled();
  expect(limit).toHaveBeenCalledWith("verified-user", "manuscript-extract", expect.any(Function));
});
it("does not consume a limit for an invalid file", async () => {
  const form = new FormData(); form.set("file", new File(["text"], "book.txt"));
  expect((await POST(new Request("http://localhost/", { method: "POST", body: form }))).status).toBe(400);
  expect(limit).not.toHaveBeenCalled();
});
