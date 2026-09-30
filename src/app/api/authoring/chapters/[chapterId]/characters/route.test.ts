import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc, getUserContext } = vi.hoisted(() => ({ rpc: vi.fn(), getUserContext: vi.fn() }));
vi.mock("@/lib/mobile/request-context", () => ({ getUserContext, requestError: () => Response.json({}, { status: 401 }) }));
import { PUT } from "./route";
const chapterId = "00000000-0000-4000-8000-000000000001";
const characterId = "00000000-0000-4000-8000-000000000002";
const current = [{ character_id: characterId }];
function call(body: unknown) {
  return PUT(new Request("http://localhost/api/test", { method: "PUT", body: JSON.stringify(body) }), { params: Promise.resolve({ chapterId }) });
}
beforeEach(() => {
  vi.clearAllMocks();
  getUserContext.mockResolvedValue({ userId: "author", supabase: {
    rpc, from: () => ({ select: () => ({ eq: async () => ({ data: current, error: null }) }) }),
  } });
  rpc.mockResolvedValue({ data: [characterId], error: null });
});
describe("atomic character assignment route", () => {
  it("rejects malformed IDs before any mutation", async () => {
    expect((await call({ characterIds: [characterId, 123] })).status).toBe(400);
    expect((await call({ characterIds: [], expectedCharacterIds: null })).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("forwards the expected state and returns the committed state", async () => {
    const response = await call({ characterIds: [characterId], expectedCharacterIds: [] });
    expect(rpc).toHaveBeenCalledWith("set_chapter_characters", { p_chapter_id: chapterId, p_character_ids: [characterId], p_expected_character_ids: [] });
    expect(await response.json()).toEqual({ ok: true, characterIds: [characterId] });
  });
  it("supports atomic legacy requests without an expected set", async () => {
    await call({ characterIds: [] });
    expect(rpc).toHaveBeenCalledWith("set_chapter_characters", { p_chapter_id: chapterId, p_character_ids: [] });
  });
  it("returns 409 and fresh IDs on a stale write, without retrying the mutation", async () => {
    rpc.mockResolvedValue({ error: { code: "40001" } });
    const response = await call({ characterIds: [], expectedCharacterIds: [] });
    expect(response.status).toBe(409);
    expect((await response.json()).characterIds).toEqual([characterId]);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("rejects unauthenticated requests and maps ownership failures", async () => {
    getUserContext.mockResolvedValueOnce({ userId: null });
    expect((await call({ characterIds: [] })).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ error: { code: "42501" } });
    expect((await call({ characterIds: [] })).status).toBe(403);
  });
});
