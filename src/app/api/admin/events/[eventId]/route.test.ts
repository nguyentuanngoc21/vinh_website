import { beforeEach, describe, expect, it, vi } from "vitest";
const { getAuthedAdminId, update, maybeSingle } = vi.hoisted(() => ({ getAuthedAdminId: vi.fn(), update: vi.fn(), maybeSingle: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: () => ({ from: () => ({ update }) }) }));
vi.mock("@/lib/wallet/session", () => ({ getAuthedAdminId }));
vi.mock("@/lib/events/cache", () => ({ revalidatePublicEvents: vi.fn() }));
import { revalidatePublicEvents } from "@/lib/events/cache";
import { PATCH } from "./route";
const eventId = "71000000-0000-4000-8000-000000000001";
const call = (body: unknown) => PATCH(new Request("http://localhost/api/admin/events/id", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ eventId }) });
beforeEach(() => {
  vi.clearAllMocks(); getAuthedAdminId.mockResolvedValue("admin");
  update.mockReturnValue({ eq: () => ({ select: () => ({ maybeSingle }) }) });
  maybeSingle.mockResolvedValue({ data: { id: eventId }, error: null });
});
describe("admin event moderation", () => {
  it("rejects non-admins before writing", async () => {
    getAuthedAdminId.mockResolvedValue(null);
    expect((await call({ hidden: false })).status).toBe(403);
    expect(update).not.toHaveBeenCalled();
    expect(revalidatePublicEvents).not.toHaveBeenCalled();
  });
  it("can hide an event", async () => {
    expect((await call({ hidden: true })).status).toBe(200);
    expect(revalidatePublicEvents).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ hidden: true }));
  });
  it("rejects unregistered games instead of accepting arbitrary embed code", async () => {
    expect((await call({ gameIds: ["https://malicious.test/game"] })).status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
  it("rejects invalid moderation values", async () => {
    expect((await call({ hidden: "false" })).status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
});
