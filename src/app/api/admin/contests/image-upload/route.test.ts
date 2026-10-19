import { beforeEach, expect, it, vi } from "vitest";

const { auth, signed, from, rate } = vi.hoisted(() => ({
  auth: vi.fn(), signed: vi.fn(), from: vi.fn(), rate: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: () => ({ storage: { from } }) }));
vi.mock("@/lib/wallet/session", () => ({ getAuthedAdminId: auth }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: rate }));
import { POST } from "./route";

const call = (body: unknown) => POST(new Request("http://localhost/api/admin/contests/image-upload", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
}));
beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue("admin-id");
  rate.mockReturnValue(true);
  signed.mockImplementation(async (path: string) => ({ data: { path, token: "signed-token" }, error: null }));
  from.mockReturnValue({ createSignedUploadUrl: signed, getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.example/${path}` } }) });
});
it("denies upload tokens to non-admin callers", async () => {
  auth.mockResolvedValue(null);
  expect((await call({ contentType: "image/png", size: 100 })).status).toBe(401);
  expect(from).not.toHaveBeenCalled();
});
it.each([
  { contentType: "image/svg+xml", size: 100 },
  { contentType: "toString", size: 100 },
  { contentType: "image/png", size: 0 },
  { contentType: "image/png", size: 10485761 },
])("rejects unsupported uploads before issuing a token: %j", async (body) => {
  expect((await call(body)).status).toBe(400);
  expect(signed).not.toHaveBeenCalled();
});
it("issues a token with an admin-scoped generated path", async () => {
  const response = await call({ contentType: "image/png", size: 10485760, path: "overwrite.png" });
  expect(response.status).toBe(200);
  expect(from).toHaveBeenCalledWith("contest-images");
  const result = await response.json();
  expect(result.path).toMatch(/^admin-id\/[a-f0-9-]+\.png$/);
  expect(result.token).toBe("signed-token");
});
it("enforces the upload rate limit", async () => {
  rate.mockReturnValue(false);
  expect((await call({ contentType: "image/png", size: 100 })).status).toBe(429);
  expect(signed).not.toHaveBeenCalled();
});
