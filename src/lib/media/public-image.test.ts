import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isPublicImagePath, publicImageProps, publicImageUrl } from "./public-image";

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co"));
afterEach(() => vi.unstubAllEnvs());
const image = "https://project.supabase.co/storage/v1/object/public/design-images/author/cover.png";

describe("public display URLs", () => {
  it("uses stable bounded variants and supplies a retina source", () => {
    const props = publicImageProps(image, 320);
    const url = new URL(props.src, "https://website.test");
    expect(url.pathname).toBe("/api/media/public-image");
    expect(Object.fromEntries(url.searchParams)).toEqual({ bucket: "design-images", path: "author/cover.png", w: "320", v: "1" });
    expect(props.srcSet).toContain("w=640");
    expect(publicImageUrl(image, 10000)).toContain("w=1280");
  });
  it.each([
    "https://other.supabase.co/storage/v1/object/public/design-images/a.png",
    "https://project.supabase.co/storage/v1/object/sign/design-images/a.png?token=secret",
    "https://project.supabase.co/storage/v1/object/public/identity-documents/a.jpg",
    `${image}?v=changed`, "blob:https://website.test/preview", "/local.png", "data:image/png;base64,abc",
  ])("leaves private, signed, external and preview sources untouched: %s", src => {
    expect(publicImageProps(src)).toEqual({ src });
  });
  it.each(["../secret.png", "a/../secret.png", "a//b.png", "a/%2e%2e/b.png", "a\\b.png", "a.svg", "a.png?x=1"])("rejects unsafe paths: %s", path => {
    expect(isPublicImagePath("design-images", path)).toBe(false);
  });
});
