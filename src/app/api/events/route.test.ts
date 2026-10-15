import { beforeEach, describe, expect, it, vi } from "vitest";
const { getRequestContext, validateEventBanner, insert, single } = vi.hoisted(() => ({
  getRequestContext: vi.fn(), validateEventBanner: vi.fn(), insert: vi.fn(), single: vi.fn(),
}));
vi.mock("@/lib/mobile/request-context", () => ({ getRequestContext, requestError: () => Response.json({}, { status: 503 }) }));
vi.mock("@/lib/events/banner-upload", () => ({ validateEventBanner }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => true }));
import { POST } from "./route";
const body = { title: "Sự kiện cộng đồng", summary: "Giới thiệu", overview: "Nội dung",
  starts_at: "2026-11-15T14:00:00+07:00", ends_at: "2026-11-15T16:00:00+07:00",
  venue: "Địa điểm", address: "Địa chỉ", city: "Hà Nội", category: "Gặp gỡ", organizer_bio: "",
  price_vnd: 0, ticket_url: "", banner_path: "", status: "draft" };
const call = (extra = {}) => POST(new Request("http://localhost/api/events", { method: "POST", body: JSON.stringify({ ...body, ...extra }) }));
beforeEach(() => {
  vi.clearAllMocks();
  insert.mockReturnValue({ select: () => ({ single }) });
  single.mockResolvedValue({ data: { id: "created-event" }, error: null });
  getRequestContext.mockResolvedValue({ userId: "actual-user", client: { from: () => ({ insert }) } });
  validateEventBanner.mockResolvedValue(null);
});
describe("create community event", () => {
  it("requires login", async () => {
    getRequestContext.mockResolvedValue({ userId: null });
    expect((await call()).status).toBe(401);
    expect(insert).not.toHaveBeenCalled();
  });
  it("binds the organizer to the verified identity and ignores privileged fields", async () => {
    expect((await call({ organizer_id: "victim", hidden: false, games: [{ id: "malicious" }] })).status).toBe(201);
    const saved = insert.mock.calls[0][0];
    expect(saved.organizer_id).toBe("actual-user");
    expect(saved).not.toHaveProperty("hidden"); expect(saved).not.toHaveProperty("games");
  });
  it("rejects an invalid banner before writing", async () => {
    validateEventBanner.mockResolvedValue("Ảnh không thuộc tài khoản.");
    expect((await call({ banner_path: "victim/banner.jpg" })).status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });
  it("rejects invalid event dates before writing", async () => {
    expect((await call({ ends_at: body.starts_at })).status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });
});
