import { beforeEach, describe, expect, it, vi } from "vitest";

const { viewer, client, recommendations, progress } = vi.hoisted(() => ({
  viewer: vi.fn(), client: vi.fn(), recommendations: vi.fn(), progress: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: client }));
vi.mock("@/lib/wallet/session", () => ({ getAuthedUserId: viewer }));
vi.mock("@/lib/recommendations/get-recommended-books", () => ({ getRecommendedBooks: recommendations }));
vi.mock("@/lib/audio/get-listening-progress", () => ({ getListeningProgress: progress }));
import { GET as getRecommendations } from "./route";
import { GET as getProgress } from "@/app/api/audio/listening-progress/route";

const scopedClient = { identity: "cookie-scoped" };
beforeEach(() => {
  vi.clearAllMocks();
  viewer.mockResolvedValue("viewer-A");
  client.mockResolvedValue(scopedClient);
  recommendations.mockImplementation(async (_, id) => [{ id }]);
  progress.mockImplementation(async (_, id) => [{ id }]);
});

describe.each([
  { name: "recommendations", get: getRecommendations, load: recommendations, args: [] },
  { name: "listening progress", get: getProgress, load: progress, args: [4] },
])("private $name endpoint", ({ get, load, args }) => {
  it("rejects guests before loading personal data and prohibits caching", async () => {
    viewer.mockResolvedValue(null);
    const response = await get();
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(client).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });
  it("uses the current verified viewer for each request, not a shared cached result", async () => {
    const a = await get();
    viewer.mockResolvedValue("viewer-B");
    const b = await get();
    expect(await a.json()).toEqual({ items: [{ id: "viewer-A" }] });
    expect(await b.json()).toEqual({ items: [{ id: "viewer-B" }] });
    expect(load).toHaveBeenNthCalledWith(1, scopedClient, "viewer-A", ...args);
    expect(load).toHaveBeenNthCalledWith(2, scopedClient, "viewer-B", ...args);
    for (const response of [a, b]) {
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("vary")).toBe("Cookie");
    }
  });
  it("keeps errors private and does not return internal details", async () => {
    load.mockRejectedValue(new Error("private backend detail"));
    const response = await get();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).not.toContain("private backend detail");
  });
  it("returns an empty list without fabricating recommendations/progress", async () => {
    load.mockResolvedValue([]);
    expect(await (await get()).json()).toEqual({ items: [] });
  });
});
