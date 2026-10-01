import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), agreement: vi.fn(), cache: vi.fn() }));
vi.mock("@/lib/cron-auth", () => ({ rejectUnauthorizedCron: mocks.auth }));
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/legal/registry", () => ({ getAgreement: mocks.agreement }));
vi.mock("@/lib/cache/public-data", () => ({ revalidatePublicBooks: mocks.cache }));
import { GET } from "./route";
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.mockReturnValue(null);
  mocks.agreement.mockReturnValue({ updatedAt: "2026-10-01" });
  mocks.rpc.mockResolvedValue({ data: 21, error: null });
});
describe("scheduled publication worker", () => {
  it("does not execute without cron authorization", async () => {
    mocks.auth.mockReturnValue(new Response(null, { status: 401 }));
    expect((await GET(new Request("http://localhost/cron"))).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("supplies the current agreement version and refreshes public pages", async () => {
    const response = await GET(new Request("http://localhost/cron"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ publishedCount: 21 });
    expect(mocks.rpc).toHaveBeenCalledWith("run_due_chapter_publications", { p_agreement_version: "2026-10-01" });
    expect(mocks.cache).toHaveBeenCalledOnce();
  });
  it("fails closed when agreement configuration is unavailable", async () => {
    mocks.agreement.mockReturnValue(null);
    expect((await GET(new Request("http://localhost/cron"))).status).toBe(500);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
