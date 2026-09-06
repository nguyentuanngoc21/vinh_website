import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/ssr";
import { NavStripLinks } from "@/components/nav-strip-links";
import { MobileNavDrawer } from "@/components/mobile-nav-drawer";

type NavBarContentProps = {
  showSearch?: boolean;
  searchPlaceholder?: string;
};

/**
 * Nội dung bên trong thanh nav màu brand-ink: từ `lg` trở lên là danh sách
 * link điều hướng (NavStripLinks), dưới `lg` thay bằng hamburger (mở
 * MobileNavDrawer) — luôn kèm ô tìm kiếm ở ngoài cùng bên phải (`ml-auto`)
 * ở mọi kích thước màn hình, để không còn tình trạng mất search khi thu
 * nhỏ màn hình.
 *
 * Dùng chung cho site-header.tsx (thanh nav sticky, hầu hết các trang) và
 * book-coverflow.tsx (trang chủ, thanh nav không sticky, cuộn cùng nội
 * dung) — 2 nơi tự lo phần bleed/nền riêng của thanh nav, chỉ tái dùng
 * phần nội dung bên trong để tránh lệch nhau giữa 2 nơi như trước.
 */
export function NavBarContent({
  showSearch = true,
  searchPlaceholder = "Tìm truyện, tác giả…",
}: NavBarContentProps) {
  return (
    <>
      <div className="hidden items-center gap-5 lg:flex">
        <NavStripLinks />
      </div>
      <MobileNavDrawer />
      {showSearch && (
        <div className="ml-auto flex w-[170px] min-w-0 items-center gap-2 rounded-full bg-white/12 px-3.5 py-2 text-sm text-white/70 sm:w-[220px] lg:w-[240px]">
          <MagnifyingGlassIcon size={16} className="shrink-0" />
          <span className="truncate">{searchPlaceholder}</span>
        </div>
      )}
    </>
  );
}
