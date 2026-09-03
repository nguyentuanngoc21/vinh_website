import Link from "next/link";
import { MagnifyingGlassIcon, BookmarkSimpleIcon } from "@phosphor-icons/react/dist/ssr";
import { NavStripLinks } from "@/components/nav-strip-links";
import { AuthCluster } from "@/components/auth-cluster";
import { VinhMark } from "@/components/ui";

type SiteHeaderProps = {
  /** Home renders the nav strip itself, further down the page. */
  showNav?: boolean;
  /** Kết nối has its own people search field; the generic one would duplicate it. */
  showSearch?: boolean;
  searchPlaceholder?: string;
  ctaLabel?: string;
  /** Where the CTA button goes — defaults to "viết truyện mới". Audio/Thiết
   * kế pages override this to their own upload flow (/audio/new,
   * /thiet-ke/new) so the label and destination actually match. */
  ctaHref?: string;
};

export function SiteHeader({
  showNav = true,
  showSearch = true,
  searchPlaceholder = "Tìm truyện, tác giả…",
  ctaLabel = "Viết truyện",
  ctaHref = "/author/new",
}: SiteHeaderProps = {}) {
  return (
    <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-x-[26px] gap-y-3 border-b border-[#f0f0f0] bg-white/96 px-4 py-4 backdrop-blur sm:px-8 lg:px-11">
      <Link href="/" className="flex shrink-0 items-center gap-[9px] no-underline">
        <VinhMark size={34} tone="ink" className="shrink-0" />
        <span className="text-[27px] font-extrabold tracking-[-0.5px] text-brand-ink">
          Vịnh
        </span>
      </Link>

      {showNav && (
        <div className="order-3 -mx-4 -mb-4 flex min-w-0 flex-[0_0_calc(100%+32px)] gap-5 overflow-x-auto overflow-y-hidden bg-brand-ink px-4 py-[13px] text-[15px] font-medium [scrollbar-width:none] sm:-mx-8 sm:flex-[0_0_calc(100%+64px)] sm:px-8 lg:-mx-11 lg:flex-[0_0_calc(100%+88px)] lg:px-11 [&::-webkit-scrollbar]:hidden">
          <NavStripLinks />
        </div>
      )}

      <div className="flex shrink-0 items-center gap-3.5">
        {showSearch && (
          <div
            data-tour="tour-search"
            className="hidden w-[240px] items-center gap-2 rounded-full bg-neutral-bg px-4 py-2.5 text-sm text-[#9a9a9a] lg:flex"
          >
            <MagnifyingGlassIcon size={16} />
            {searchPlaceholder}
          </div>
        )}
        <span data-tour="tour-bookmark" className="inline-flex">
          <BookmarkSimpleIcon
            size={21}
            className="cursor-default text-[#3a3a3a] transition-colors hover:text-brand-gold-dark"
          />
        </span>
        <AuthCluster ctaLabel={ctaLabel} ctaHref={ctaHref} />
      </div>
    </header>
  );
}
