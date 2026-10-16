import { beforeEach, expect, it, vi } from "vitest";
const { getUserContext, limit, extractRawText, enqueue } = vi.hoisted(() => ({ getUserContext: vi.fn(), limit: vi.fn(), extractRawText: vi.fn(), enqueue: vi.fn() }));
vi.mock("@/lib/mobile/request-context", () => ({ getUserContext, requestError: () => Response.json({}, { status: 503 }) }));
vi.mock("@/lib/heavy-request-limit", () => ({ limitHeavyRequest: limit }));
vi.mock("mammoth", () => ({ default: { extractRawText, convertToHtml: async () => ({ value: "<p>text</p>" }) } }));
vi.mock("@/lib/authoring/manuscript-queue", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/authoring/manuscript-queue")>(), enqueueManuscript: enqueue,
}));
import { POST } from "./route";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("MANUSCRIPT_QUEUE_ENABLED", "false");
  getUserContext.mockResolvedValue({ userId: "verified-user", admin: () => ({}) });
  limit.mockResolvedValue(Response.json({}, { status: 429, headers: { "Retry-After": "60" } }));
});
function queuedRequest(headers = {}) {
  const form = new FormData(); form.set("file", new File(["docx fixture"], "book.docx")); form.set("async", "1");
  return new Request("http://localhost/", { method: "POST", body: form, headers });
}
it("enqueues opted-in web imports only when enabled and normalizes UUID paths", async () => {
  vi.stubEnv("MANUSCRIPT_QUEUE_ENABLED", "true"); limit.mockResolvedValue(null);
  enqueue.mockResolvedValue(Response.json({ jobId: "id" }, { status: 202 }));
  const id = "ABCDEF00-0000-4000-8000-000000000001";
  expect((await POST(queuedRequest({ "x-import-id": id }))).status).toBe(202);
  expect(enqueue).toHaveBeenCalledWith({}, "verified-user", id.toLowerCase(), expect.any(File));
  expect(extractRawText).not.toHaveBeenCalled();
});
it.each([false, true])("keeps synchronous compatibility when flag off or bearer mobile (mobile=%s)", async mobile => {
  vi.stubEnv("MANUSCRIPT_QUEUE_ENABLED", mobile ? "true" : "false"); limit.mockResolvedValue(null);
  extractRawText.mockResolvedValue({ value: "text", messages: [] });
  const headers: Record<string, string> = mobile ? { authorization: "Bearer mobile" } : {};
  expect((await POST(queuedRequest(headers))).status).toBe(200);
  expect(enqueue).not.toHaveBeenCalled();
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
