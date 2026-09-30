import { beforeEach, describe, expect, it, vi } from "vitest";
const { getUserContext, createSignedUploadUrl, book } = vi.hoisted(() => ({
  getUserContext: vi.fn(), createSignedUploadUrl: vi.fn(), book: { current: { id: "b" } as { id: string } | null },
}));
vi.mock("@/lib/mobile/request-context", () => ({ getUserContext, requestError: () => Response.json({}, { status: 401 }) }));
import { POST } from "./route";
const bookId = "00000000-0000-4000-8000-000000000001";
const call = (body: unknown, id = bookId) =>
  POST(new Request("http://localhost/api/test", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ bookId: id }) });
const chain = { select: () => chain, eq: () => chain, is: () => chain, maybeSingle: async () => ({ data: book.current, error: null }) };
beforeEach(() => {
  vi.clearAllMocks();
  book.current = { id: bookId };
  createSignedUploadUrl.mockImplementation(async (path: string) => ({ data: { path, token: "t" }, error: null }));
  getUserContext.mockResolvedValue({ userId: "author", supabase: { from: () => chain }, admin: () => ({ storage: { from: () => ({
    createSignedUploadUrl, getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/avatars/${path}` } }),
  }) } }) });
});
describe("character avatar upload URL route", () => {
  it("rejects unsupported types and bad book IDs without touching storage", async () => {
    expect((await call({ contentType: "image/gif" })).status).toBe(400);
    expect((await call({ contentType: "image/jpeg" }, "x")).status).toBe(400);
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });
  it("refuses books the caller does not own", async () => {
    book.current = null;
    expect((await call({ contentType: "image/jpeg" })).status).toBe(403);
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });
  it("issues a URL inside the author's own folder and returns the public URL", async () => {
    const data = await (await call({ contentType: "image/jpeg" })).json();
    expect(data.path).toMatch(new RegExp(`^author/character-${bookId}-\\d+\\.jpg$`));
    expect(data.publicUrl).toBe(`https://cdn.test/avatars/${data.path}`);
  });
});
