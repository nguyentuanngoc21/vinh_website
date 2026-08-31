import { type ReactNode } from "react";
import { WrenchIcon } from "@phosphor-icons/react/dist/ssr";

/**
 * Wraps a section's mock content (Audio, Blog, Thiết kế, Kết nối — see
 * their page.tsx files, none of these are wired to real data yet) in a
 * blurred, dimmed, non-interactive layer labelled "Đang phát triển". The
 * content stays in the DOM — so the layout/design work already done isn't
 * thrown away, just blurred and unreachable — `inert` drops it from
 * focus/tab order and the accessibility tree on top of the visual blur.
 * Unwrap (delete this import, keep the children) once a section is
 * actually wired up.
 *
 * /rankings no longer wraps its whole page in this — its "Truyện chữ" tab
 * is real (src/lib/rankings/get-book-rankings.ts); only the "Audio"/"Blog"
 * tabs' result area still uses it, applied inside rankings-board.tsx
 * (MaybeBlurred) so the still-mock tabs blur without hiding the (real,
 * interactive) tab/period/genre controls around them.
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
