import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUDIO_MAX_BYTES } from "@/lib/audio/upload-rules";
const { requireSupabaseUser, createSignedUploadUrl } = vi.hoisted(() => ({
  requireSupabaseUser: vi.fn(), createSignedUploadUrl: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  requireSupabaseUser,
  createClient: async () => ({ storage: { from: () => ({ createSignedUploadUrl }) } }),
}));
import { POST } from "./route";
vi.mock("@/lib/heavy-request-limit", () => ({ limitHeavyRequest: vi.fn() }));
import { limitHeavyRequest } from "@/lib/heavy-request-limit";
const call = (body: unknown) => POST(new Request("http://localhost/api/audio/upload-url", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(limitHeavyRequest).mockResolvedValue(null);
  requireSupabaseUser.mockResolvedValue({ user: { id: "narrator" } });
  createSignedUploadUrl.mockImplementation(async (path: string) => ({ data: { path, token: "token" }, error: null }));
});
describe("audio direct upload URL", () => {
  it("does not issue a storage token when throttled", async () => {
    vi.mocked(limitHeavyRequest).mockResolvedValue(Response.json({}, { status: 429, headers: { "Retry-After": "60" } }));
    const response = await call({ contentType: "audio/mpeg", size: 100 });
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
    expect(limitHeavyRequest).toHaveBeenCalledWith("narrator", "audio-upload");
  });
  it.each([5 * 1024 * 1024, AUDIO_MAX_BYTES])("accepts %i-byte files via a small JSON request", async (size) => {
    const response = await call({ contentType: "audio/mpeg", size });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ path: expect.stringMatching(/^narrator\/narration-\d+-[a-f\d-]+\.mp3$/), token: "token" });
  });
  it.each([0, -1, undefined, 1.5])("rejects invalid size %s before issuing a token", async (size) => {
    expect((await call({ contentType: "audio/mpeg", size })).status).toBe(400);
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });
  it("rejects files above 50 MiB", async () => {
    expect((await call({ contentType: "audio/mpeg", size: AUDIO_MAX_BYTES + 1 })).status).toBe(413);
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });
  it("rejects unsupported MIME", async () => {
    expect((await call({ contentType: "text/plain", size: 100 })).status).toBe(400);
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });
  it("requires authentication", async () => {
    requireSupabaseUser.mockResolvedValue({ response: Response.json({}, { status: 401 }) });
    expect((await call({ contentType: "audio/mpeg", size: 100 })).status).toBe(401);
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });
});
