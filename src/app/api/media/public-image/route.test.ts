import sharp from "sharp";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";
import { buildPublicNoAiXmpPacket } from "@/lib/copyright/public-asset-watermark";

const fetchMock = vi.fn();
const call = (query = "bucket=design-images&path=author%2Fcover.png&w=320&v=1") => GET(new Request(`https://website.test/api/media/public-image?${query}`, { headers: { Cookie: "private-session", Authorization: "Bearer private-token" } }));
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("serves a smaller WebP, keeps copyright XMP and sets shared/browser cache headers", async () => {
  const xmp = buildPublicNoAiXmpPacket("Artist & <Studio>");
  const original = await sharp({ create: { width: 1600, height: 2400, channels: 3, background: "#3a5068" } }).png().withXmp(xmp).toBuffer();
  fetchMock.mockResolvedValue(new Response(new Uint8Array(original), { headers: { "Content-Type": "image/png" } }));
  const response = await call();
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/webp");
  expect(response.headers.get("vercel-cdn-cache-control")).toContain("s-maxage=2592000");
  expect(response.headers.get("cache-control")).toBe("public, max-age=86400");
  expect(response.headers.has("set-cookie")).toBe(false);
  const output = Buffer.from(await response.arrayBuffer());
  const metadata = await sharp(output).metadata();
  expect(metadata.width).toBe(320);
  expect(metadata.height).toBe(480);
  expect(metadata.xmp?.toString()).toBe(xmp);
  expect(output.length).toBeLessThan(original.length);
  const [url, options] = fetchMock.mock.calls[0];
  expect(String(url)).toBe("https://project.supabase.co/storage/v1/object/public/design-images/author/cover.png");
  expect(options).toMatchObject({ redirect: "error", cache: "no-store" });
  expect(options.headers).toBeUndefined(); // No session or service-role credentials forwarded.
});

it.each([
  "bucket=identity-documents&path=a.jpg&w=320&v=1",
  "bucket=order-deliverables&path=a.png&w=320&v=1",
  "bucket=design-images&path=..%2Fa.png&w=320&v=1",
  "bucket=design-images&path=a%2F%252e%252e%2Fb.png&w=320&v=1",
  "bucket=design-images&path=a.svg&w=320&v=1",
  "bucket=design-images&path=a.png&w=9999&v=1",
  "bucket=design-images&path=a.png&w=0320&v=1",
  "bucket=design-images&path=a.png&w=320&w=640&v=1",
  "bucket=design-images&path=a.png&w=320&v=1&url=https://evil.test",
])("rejects unsupported sources/variants without a fetch: %s", async query => {
  expect((await call(query)).status).toBe(400);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("does not cache missing or invalid image responses", async () => {
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
  const missing = await call();
  expect(missing.status).toBe(404);
  expect(missing.headers.get("cache-control")).toBe("no-store");
  fetchMock.mockResolvedValueOnce(new Response("<svg/>", { headers: { "Content-Type": "image/svg+xml" } }));
  expect((await call()).status).toBe(415);
  fetchMock.mockResolvedValueOnce(new Response("bad image", { headers: { "Content-Type": "image/png" } }));
  expect((await call()).status).toBe(502);
});

it("bounds upstream input size even if Content-Length is missing", async () => {
  fetchMock.mockResolvedValueOnce(new Response(new Uint8Array(16 * 1024 * 1024 + 1), { headers: { "Content-Type": "image/png" } }));
  expect((await call()).status).toBe(413);
});

it("does not follow redirects to another server", async () => {
  fetchMock.mockRejectedValueOnce(new TypeError("redirect encountered"));
  const response = await call();
  expect(response.status).toBe(502);
  expect(response.headers.get("cache-control")).toBe("no-store");
});
