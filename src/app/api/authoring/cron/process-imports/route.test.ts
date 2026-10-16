import { beforeEach, expect, it, vi } from "vitest";
const { clean, processJob } = vi.hoisted(() => ({ clean: vi.fn(), processJob: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: () => ({}) }));
vi.mock("@/lib/authoring/manuscript-worker", () => ({ cleanExpiredImports: clean, processOneManuscript: processJob }));
import { GET } from "./route";
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("CRON_SECRET", "test-secret"); vi.stubEnv("MANUSCRIPT_QUEUE_ENABLED", "true");
  clean.mockResolvedValue(0); processJob.mockResolvedValue({ processed: 1 });
});
it("requires cron authentication before doing any work", async () => {
  expect((await GET(new Request("http://localhost/"))).status).toBe(401);
  expect(clean).not.toHaveBeenCalled(); expect(processJob).not.toHaveBeenCalled();
});
it("fails closed if the cron secret is missing", async () => {
  vi.stubEnv("CRON_SECRET", "");
  expect((await GET(new Request("http://localhost/"))).status).toBe(401);
});
it("continues expiry cleanup after queue is switched off", async () => {
  vi.stubEnv("MANUSCRIPT_QUEUE_ENABLED", "false");
  expect((await GET(new Request("http://localhost/", { headers: { authorization: "Bearer test-secret" } }))).status).toBe(200);
  expect(clean).toHaveBeenCalledOnce(); expect(processJob).not.toHaveBeenCalled();
});
