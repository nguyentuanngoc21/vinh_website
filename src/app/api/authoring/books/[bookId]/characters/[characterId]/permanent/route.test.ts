import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc, getUserContext } = vi.hoisted(() => ({ rpc: vi.fn(), getUserContext: vi.fn() }));
vi.mock("@/lib/mobile/request-context", () => ({ getUserContext, requestError: () => Response.json({}, { status: 401 }) }));
import { DELETE } from "./route";
const bookId = "00000000-0000-4000-8000-000000000001";
const characterId = "00000000-0000-4000-8000-000000000002";
const call = (ids = { bookId, characterId }) =>
  DELETE(new Request("http://localhost/api/test", { method: "DELETE" }), { params: Promise.resolve(ids) });
beforeEach(() => {
  vi.clearAllMocks();
  getUserContext.mockResolvedValue({ userId: "author", supabase: { rpc } });
  rpc.mockResolvedValue({ data: null, error: null });
});
describe("permanent character delete route", () => {
  it("validates IDs before calling the database", async () => {
    expect((await call({ bookId: "x", characterId })).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("deletes through the window-enforcing RPC", async () => {
    const response = await call();
    expect(rpc).toHaveBeenCalledWith("delete_recent_character", { p_book_id: bookId, p_character_id: characterId });
    expect(await response.json()).toEqual({ ok: true });
  });
  it("maps expired window and reader activity to distinct 409 messages", async () => {
    rpc.mockResolvedValue({ error: { code: "55000", hint: "expired" } });
    const expired = await call();
    expect(expired.status).toBe(409);
    expect((await expired.json()).error).toContain("15 phút");
    rpc.mockResolvedValue({ error: { code: "55000", hint: "reader_activity" } });
    expect((await (await call()).json()).error).toContain("độc giả");
  });
  it("maps ownership failures and missing sessions", async () => {
    rpc.mockResolvedValue({ error: { code: "42501" } });
    expect((await call()).status).toBe(404);
    getUserContext.mockResolvedValue({ userId: null, supabase: { rpc } });
    expect((await call()).status).toBe(401);
  });
});
