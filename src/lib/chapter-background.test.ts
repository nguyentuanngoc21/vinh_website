import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { chapterBackgroundPath, processChapterBackground } from "./chapter-background";

describe("processChapterBackground", () => {
  it("shrinks to WebP within 1600px and embeds the no-AI XMP", async () => {
    const source = await sharp({ create: { width: 4000, height: 2500, channels: 3, background: "#336699" } }).png().toBuffer();
    const out = await processChapterBackground(source, "Truyện thử");
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("webp");
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(1600);
    expect(meta.xmp?.toString()).toContain("Không sử dụng để huấn luyện mô hình AI");
    expect(meta.xmp?.toString()).toContain("Truyện thử");
  });
  it("never enlarges small images", async () => {
    const source = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#000" } }).jpeg().toBuffer();
    expect((await sharp(await processChapterBackground(source, "x")).metadata()).width).toBe(800);
  });
  it("builds the path pattern the DB trigger accepts", () => {
    const a = "00000000-0000-4000-8000-000000000001", c = "00000000-0000-4000-8000-000000000002";
    expect(chapterBackgroundPath(a, c)).toMatch(new RegExp(`^${a}/chapter-bg-${c}-[0-9]{1,16}\.webp$`));
  });
});
