import { beforeEach, describe, expect, it, vi } from "vitest";
const { getRequestContext, validateEventBanner, eq, update, maybeSingle } = vi.hoisted(() => ({
  getRequestContext: vi.fn(), validateEventBanner: vi.fn(), eq: vi.fn(), update: vi.fn(), maybeSingle: vi.fn(),
}));
vi.mock("@/lib/mobile/request-context", () => ({ getRequestContext, requestError: () => Response.json({}, { status: 503 }) }));
vi.mock("@/lib/events/banner-upload", () => ({ validateEventBanner }));
vi.mock("@/lib/events/cache", () => ({ revalidatePublicEvents: vi.fn() }));
import { revalidatePublicEvents } from "@/lib/events/cache";
import { PATCH } from "./route";
const eventId = "71000000-0000-4000-8000-000000000001";
const body = { title: "Sự kiện cộng đồng", summary: "Giới thiệu", overview: "Nội dung",
  starts_at: "2026-11-15T14:00:00+07:00", ends_at: "2026-11-15T16:00:00+07:00",
  venue: "Địa điểm", address: "Địa chỉ", city: "Hà Nội", category: "Gặp gỡ", organizer_bio: "",
  price_vnd: 0, ticket_url: "", banner_path: "", status: "published" };
const call = (extra = {}) => PATCH(new Request("http://localhost/api/events/id", { method: "PATCH", body: JSON.stringify({ ...body, ...extra }) }), { params: Promise.resolve({ eventId }) });
const chain = { eq, select: () => chain, maybeSingle };
beforeEach(() => {
  vi.clearAllMocks();
  eq.mockReturnValue(chain); update.mockReturnValue(chain);
  maybeSingle.mockResolvedValue({ data: { id: eventId }, error: null });
  getRequestContext.mockResolvedValue({ userId: "actual-user", client: { from: () => ({ update }) } });
  validateEventBanner.mockResolvedValue(null);
});
describe("update community event", () => {
  it("uses atomic owner and moderation predicates", async () => {
    expect((await call({ organizer_id: "victim", hidden: false, games: [{ id: "malicious" }] })).status).toBe(200);
    expect(revalidatePublicEvents).toHaveBeenCalledOnce();
    expect(eq).toHaveBeenCalledWith("id", eventId);
    expect(eq).toHaveBeenCalledWith("organizer_id", "actual-user");
    expect(eq).toHaveBeenCalledWith("hidden", false);
    const patch = update.mock.calls[0][0];
    for (const field of ["organizer_id", "hidden", "games", "id"]) expect(patch).not.toHaveProperty(field);
  });
  it("refuses a different owner's event or an admin-hidden event", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await call()).status).toBe(403);
    expect(revalidatePublicEvents).not.toHaveBeenCalled();
  });
  it("requires authentication", async () => {
    getRequestContext.mockResolvedValue({ userId: null });
    expect((await call()).status).toBe(401);
    expect(update).not.toHaveBeenCalled();
  });
});
