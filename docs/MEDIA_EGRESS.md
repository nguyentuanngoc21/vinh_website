# Public display images

The October 2026 audit found that large cover/design images accounted for most
Storage downloads. `ProtectedImage` and `DisplayImage` now serve public Supabase
images through `/api/media/public-image`, including images uploaded before this
change. No database migration or Storage backfill is needed.

The route resizes to four fixed widths (96, 320, 640, 1280), limits the height to
1280, encodes WebP at quality 78, and retains the source XMP copyright metadata.
Source files are unchanged. Display URLs are stable; the public design gallery no
longer creates expiring signed URLs for its already-public bucket. Covers used by
the social-image redirect and blurred ranking backgrounds also use the display
route. Private/signed images and external URLs retain their existing handling.

Only `design-images`, `avatars`, `contest-images`, and `event-banners` on the
configured `NEXT_PUBLIC_SUPABASE_URL` are supported. The route sends no user
cookies, Authorization headers, or service-role keys upstream. It rejects
redirects, traversal, SVG, arbitrary URLs, unsupported widths, inputs above 16 MiB,
and images above 40 million pixels. Errors are not cached.

Successful images have a one-day browser cache and a 30-day shared CDN cache with
one day of stale-while-revalidate. On Vercel, `Vercel-CDN-Cache-Control` controls the
shared cache. Other hosts must configure a CDN to honor `CDN-Cache-Control`; without
a shared cache, each uncached request invokes conversion and fetches the source.
Source paths must be versioned when replacing an image (current upload flows use
timestamps/random IDs). Bump the display URL `v` in both the helper and route when
changing the encoding rules; this gives changed variants fresh cache keys.

Deploy the application for these changes to take effect. Existing consumed
Supabase quota is not reset. The first request per image/width/CDN region may still
download the original; subsequent cache hits serve the small image from the app's
CDN. Direct requests to existing public Supabase URLs remain possible.

After deploying, check an image request in DevTools: it should use
`/api/media/public-image`, return `image/webp`, and retain the original aspect ratio.
Check `x-vercel-cache` on repeated production requests to confirm shared-cache
hits, then compare Supabase Storage GET traffic and egress over comparable days.
Local development does not prove production CDN cache hits.

Validation: `node node_modules/vitest/vitest.mjs run src/lib/media/public-image.test.ts src/app/api/media/public-image/route.test.ts`.
