/** Only public raster buckets may go through the shared display-image cache. */
export const PUBLIC_IMAGE_BUCKETS = ["design-images", "avatars", "contest-images", "event-banners"] as const;
export const DISPLAY_IMAGE_WIDTHS = [96, 320, 640, 1280] as const;

export function isPublicImagePath(bucket: string, path: string): boolean {
  return (PUBLIC_IMAGE_BUCKETS as readonly string[]).includes(bucket)
    && path.length <= 600
    && !/[\\%\u0000-\u001f?#]/.test(path)
    && path.split("/").every(part => part.length > 0 && part !== "." && part !== "..")
    && /\.(?:png|jpe?g|webp)$/i.test(path);
}

/** Keep external, local, blob, signed and private URLs out of the public cache. */
export function publicImageUrl(src: string, width = 640): string {
  try {
    const project = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    const image = new URL(src);
    if (image.origin !== project.origin || image.search || image.hash) return src;
    const prefix = "/storage/v1/object/public/";
    if (!image.pathname.startsWith(prefix)) return src;
    const [bucket, ...parts] = decodeURIComponent(image.pathname.slice(prefix.length)).split("/");
    const path = parts.join("/");
    if (!isPublicImagePath(bucket, path)) return src;
    const w = DISPLAY_IMAGE_WIDTHS.find(value => value >= width) ?? 1280;
    return `/api/media/public-image?${new URLSearchParams({ bucket, path, w: String(w), v: "1" })}`;
  } catch {
    return src;
  }
}

/** Supply 1x/2x images without imposing an invented aspect ratio on artwork. */
export function publicImageProps(src: string, width = 640) {
  const optimized = publicImageUrl(src, width);
  if (optimized === src) return { src };
  const retina = publicImageUrl(src, width * 2);
  return { src: optimized, srcSet: retina === optimized ? undefined : `${optimized} 1x, ${retina} 2x` };
}
