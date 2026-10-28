import sharp from "sharp";
import { DISPLAY_IMAGE_WIDTHS, isPublicImagePath } from "@/lib/media/public-image";

export const runtime = "nodejs";
const MAX_SOURCE_BYTES = 16 * 1024 * 1024;
const error = (status: number) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });

/** Resize old and new public assets, retaining XMP. Never accepts a remote URL or credentials. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(key => !["bucket", "path", "w", "v"].includes(key))
    || [...params.keys()].some(key => params.getAll(key).length !== 1)
    || params.get("v") !== "1") return error(400);
  const bucket = params.get("bucket") ?? "";
  const path = params.get("path") ?? "";
  const width = Number(params.get("w"));
  if (!isPublicImagePath(bucket, path)
    || params.get("w") !== String(width)
    || !(DISPLAY_IMAGE_WIDTHS as readonly number[]).includes(width)) return error(400);

  let origin: URL;
  try {
    origin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    if (origin.protocol !== "https:" || !origin.hostname.endsWith(".supabase.co") || origin.port) return error(503);
  } catch { return error(503); }
  const source = new URL(`/storage/v1/object/public/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`, origin);

  try {
    const response = await fetch(source, {
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      // Cache the completed, small WebP at the CDN; don't put multi-MB originals in the Data Cache.
      cache: "no-store",
    });
    if (!response.ok) {
      await response.body?.cancel();
      return error(response.status === 404 ? 404 : 502);
    }
    if (!/^image\/(png|jpeg|webp)(;|$)/i.test(response.headers.get("content-type") ?? "")) {
      await response.body?.cancel();
      return error(415);
    }
    if (Number(response.headers.get("content-length")) > MAX_SOURCE_BYTES) {
      await response.body?.cancel();
      return error(413);
    }
    if (!response.body) return error(502);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_SOURCE_BYTES) { await reader.cancel(); return error(413); }
      chunks.push(value);
    }
    const output = await sharp(Buffer.concat(chunks), { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width, height: 1280, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78 })
      .keepXmp()
      .toBuffer();
    return new Response(new Uint8Array(output), { headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(output.length),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=86400",
      "CDN-Cache-Control": "public, s-maxage=2592000, stale-while-revalidate=86400",
      "Vercel-CDN-Cache-Control": "public, s-maxage=2592000, stale-while-revalidate=86400",
    } });
  } catch {
    return error(502);
  }
}
