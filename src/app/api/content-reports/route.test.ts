import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), admin: vi.fn(), from: vi.fn(), limit: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: () => ({ from: mocks.from }) }));
vi.mock("@/lib/wallet/session", () => ({ getAuthedUserId: mocks.user, getAuthedAdminId: mocks.admin }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimits: mocks.limit }));
import { POST } from "./route";
import { PATCH } from "../admin/content-reports/[reportId]/route";
const id = "12345678-1234-1234-1234-123456789012";
const body = { bookId: id, reason: "offensive", description: "Nội dung cần kiểm tra lại." };
function request(value: unknown) { return new Request("http://localhost/api/content-reports", { method: "POST", body: JSON.stringify(value) }); }
function query(result: unknown) {
  const q = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), in: vi.fn(), update: vi.fn(), maybeSingle: vi.fn().mockResolvedValue(result) };
  for (const fn of [q.select, q.eq, q.is, q.in, q.update]) fn.mockReturnValue(q);
  return q;
}
beforeEach(() => { vi.clearAllMocks(); mocks.user.mockResolvedValue(id); mocks.admin.mockResolvedValue(id); mocks.limit.mockReturnValue({ ok: true }); });
describe("content report API", () => {
  it("requires authentication before accessing reports", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await POST(request(body))).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("rejects malformed input", async () => {
    expect((await POST(request({ ...body, bookId: "bad" }))).status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("does not accept an unpublished or missing book", async () => {
    mocks.from.mockReturnValue(query({ data: null, error: null }));
    expect((await POST(request(body))).status).toBe(404);
    expect(mocks.from).toHaveBeenCalledOnce();
  });
  it("rejects chapters outside the visible book", async () => {
    const book = query({ data: { id, title: "Truyện", slug: "truyen" }, error: null });
    const chapter = query({ data: null, error: null });
    mocks.from.mockReturnValueOnce(book).mockReturnValueOnce(chapter);
    expect((await POST(request({ ...body, chapterId: id }))).status).toBe(404);
    expect(chapter.eq).toHaveBeenCalledWith("book_id", id);
    expect(chapter.eq).toHaveBeenCalledWith("published", true);
  });
  it("uses the authenticated reporter and handles duplicate submissions", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { code: "23505" } });
    mocks.from.mockReturnValueOnce(query({ data: { id, title: "Truyện", slug: "truyen" }, error: null })).mockReturnValueOnce({ insert });
    expect((await POST(request({ ...body, reporter_id: "forged" }))).status).toBe(409);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ reporter_id: id }));
  });
  it("returns 201 only after successful persistence", async () => {
    mocks.from.mockReturnValueOnce(query({ data: { id, title: "Truyện", slug: "truyen" }, error: null })).mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({ error: null }) });
    expect((await POST(request(body))).status).toBe(201);
  });
  it("blocks excessive attempts", async () => {
    mocks.limit.mockReturnValue({ ok: false, retryAfterSec: 30 });
    const response = await POST(request(body));
    expect(response.status).toBe(429); expect(response.headers.get("Retry-After")).toBe("30");
  });
});
describe("report moderation API", () => {
  const context = { params: Promise.resolve({ reportId: id }) };
  it("denies ordinary users", async () => {
    mocks.admin.mockResolvedValue(null);
    expect((await PATCH(request({ status: "resolved", note: "Đã xử lý" }), context)).status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("requires a resolution note to close a report", async () => {
    expect((await PATCH(request({ status: "resolved" }), context)).status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("does not overwrite a closed report", async () => {
    const q = query({ data: null, error: null }); mocks.from.mockReturnValue(q);
    expect((await PATCH(request({ status: "resolved", note: "Đã xử lý" }), context)).status).toBe(409);
    expect(q.in).toHaveBeenCalledWith("status", ["pending", "reviewing"]);
  });
});
