import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPublicNoAiXmpPacket } from "@/lib/copyright/public-asset-watermark";

export const CHAPTER_BACKGROUND_BUCKET = "design-images";
/** Under Vercel's ~4.5 MB request body limit; the client compresses first. */
export const CHAPTER_BACKGROUND_MAX_BYTES = 4 * 1024 * 1024;
export const CHAPTER_BACKGROUND_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_EDGE = 1600;

/**
 * Background shown behind every reader of the chapter, so it is resized and
 * re-encoded as WebP (a full-size PNG photo would cost readers several MB),
 * with the same hidden "no AI training" XMP as covers and design images —
 * see src/lib/copyright/public-asset-watermark.ts. No visible mark is burned
 * in: the reader page already overlays the author-name watermark.
 */
export async function processChapterBackground(original: Buffer, rightsHolderLabel: string): Promise<Buffer> {
  return sharp(original)
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 78 })
    .withXmp(buildPublicNoAiXmpPacket(rightsHolderLabel))
    .toBuffer();
}

/** Upload path; must match check_chapter_background_path() in the migration. */
export const chapterBackgroundPath = (authorId: string, chapterId: string) =>
  `${authorId}/chapter-bg-${chapterId}-${Date.now()}.webp`;

export function chapterBackgroundUrl(client: SupabaseClient, path: string | null | undefined): string | null {
  return path ? client.storage.from(CHAPTER_BACKGROUND_BUCKET).getPublicUrl(path).data.publicUrl : null;
}
