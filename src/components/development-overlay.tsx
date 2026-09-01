import { type ReactNode } from "react";
import { WrenchIcon } from "@phosphor-icons/react/dist/ssr";

/**
 * Wraps a section's mock content in a blurred, dimmed, non-interactive
 * layer labelled "Đang phát triển". The content stays in the DOM — so the
 * layout/design work already done isn't thrown away, just blurred and
 * unreachable — `inert` drops it from focus/tab order and the
 * accessibility tree on top of the visual blur. Unwrap (delete this
 * import, keep the children) once a section is actually wired up.
 *
 * Audio and Thiết kế no longer use this — both read real data now
 * (src/lib/audio/get-audio-catalog.ts, src/lib/design/get-design-gallery.ts,
 * see migrations/20260901_add_audio_narration_hub_metadata.sql and
 * migrations/20260901_add_design_item_gallery_metadata.sql), same for Kết
 * nối (src/app/ket-noi/page.tsx). Still wraps /blog (src/app/blog/page.tsx)
 * — no blog_posts table exists yet, see docs/supabase/schema.sql's header
 * comment.
 *
 * /rankings no longer wraps its whole page in this either — its "Truyện
 * chữ" tab is real (src/lib/rankings/get-book-rankings.ts); only the
 * "Audio"/"Blog" tabs' result area still uses it, applied inside
 * rankings-board.tsx (MaybeBlurred) so the still-mock tabs blur without
 * hiding the (real, interactive) tab/period/genre controls around them —
 * audio_narrations now has genre/play_count (see above) but that tab
 * still isn't wired to it; do that the same way get-book-rankings.ts was
 * done for "Truyện chữ" when you pick this back up.
 */
export function DevelopmentOverlay({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <div aria-hidden="true" inert className="pointer-events-none select-none blur-[12px]">
        {children}
      </div>

      <div className="pointer-events-none absolute inset-0 bg-white/80" />

      {/* `fixed` (not `sticky`) so the label stays pinned to the center of
          the viewport no matter how far the user scrolls up/down the page
          — not just centered within the overlay's own box. */}
      <div className="pointer-events-none fixed left-1/2 top-1/2 z-10 flex w-fit -translate-x-1/2 -translate-y-1/2 items-center gap-2.5 rounded-full bg-brand-ink px-7 py-3.5 text-[15px] font-bold text-white shadow-[0_10px_30px_rgba(20,59,77,0.35)]">
        <WrenchIcon weight="bold" size={17} className="text-brand-gold-light" />
        Đang phát triển
      </div>
    </div>
  );
}
