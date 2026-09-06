import Link from "next/link";
import { BookmarkSimpleIcon } from "@phosphor-icons/react/dist/ssr";
import { NavBarContent } from "@/components/nav-bar-content";
import { AuthCluster } from "@/components/auth-cluster";
import { VinhMark } from "@/components/ui";

type SiteHeaderProps = {
  /** Home renders the nav bar itself, further down the page (không sticky
   * cùng header — xem book-coverflow.tsx). */
  showNav?: boolean;
  /** Kết nối có ô tìm người riêng — ô chung sẽ bị trùng. */
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
      {/* Logo + bookmark + AuthCluster — giữ nguyên ở mọi kích thước màn
          hình, không ẩn/thu gọn gì thêm (ô tìm kiếm đã chuyển xuống thanh
          nav màu brand-ink bên dưới — xem NavBarContent). */}
      <Link href="/" className="flex shrink-0 items-center gap-[9px] no-underline">
        <VinhMark size={34} tone="ink" className="shrink-0" />
        <span className="text-[27px] font-extrabold tracking-[-0.5px] text-brand-ink">
          Vịnh
        </span>
      </Link>

      <div className="flex items-center gap-3.5">
        <span data-tour="tour-bookmark" className="inline-flex">
          <BookmarkSimpleIcon
            size={21}
            className="cursor-default text-[#3a3a3a] transition-colors hover:text-brand-gold-dark"
          />
        </span>
        <AuthCluster ctaLabel={ctaLabel} ctaHref={ctaHref} />
      </div>

      {showNav && (
        // Thanh nav màu brand-ink: từ `lg` trở lên liệt kê link điều
        // hướng, dưới `lg` thay bằng hamburger — luôn kèm ô tìm kiếm bên
        // phải ở MỌI kích thước (xem NavBarContent). order-3 + bleed full
        // chiều rộng để xuống hàng riêng, y hệt kỹ thuật cũ.
        <div className="order-3 -mx-4 -mb-4 flex min-w-0 flex-[0_0_calc(100%+32px)] items-center gap-5 overflow-x-auto overflow-y-hidden bg-brand-ink px-4 py-[13px] text-[15px] font-medium [scrollbar-width:none] sm:-mx-8 sm:flex-[0_0_calc(100%+64px)] sm:px-8 lg:-mx-11 lg:flex-[0_0_calc(100%+88px)] lg:px-11 [&::-webkit-scrollbar]:hidden">
          <NavBarContent showSearch={showSearch} searchPlaceholder={searchPlaceholder} />
        </div>
      )}
    </header>
  );
}
