import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/ssr";
import { NavStripLinks } from "@/components/nav-strip-links";
import { MobileNavDrawer } from "@/components/mobile-nav-drawer";

export type SearchType = "truyen" | "audio" | "thiet-ke";

type NavBarContentProps = {
  showSearch?: boolean;
  searchPlaceholder?: string;
  /** Tab mặc định khi trang /tim-kiem mở ra từ ô tìm kiếm này — mỗi khu
   * vực (Audio/Thiết kế/Blog) có placeholder riêng nhưng đều nộp vào
   * cùng 1 trang kết quả chung, chỉ khác tab nào được chọn sẵn. */
  searchType?: SearchType;
  /** Chỉ /tim-kiem/page.tsx truyền vào — hiện lại đúng từ khoá vừa tìm
   * trong ô, thay vì để trống sau khi điều hướng. */
  searchDefaultValue?: string;
};

/**
 * Nội dung bên trong thanh nav màu brand-ink: từ `lg` trở lên là danh sách
 * link điều hướng (NavStripLinks), dưới `lg` thay bằng hamburger (mở
 * MobileNavDrawer) — luôn kèm ô tìm kiếm ở ngoài cùng bên phải (`ml-auto`)
 * ở mọi kích thước màn hình, để không còn tình trạng mất search khi thu
 * nhỏ màn hình.
 *
 * Ô tìm kiếm là <form method="get"> điều hướng thẳng tới /tim-kiem —
 * KHÔNG cần "use client"/JS: trình duyệt tự submit như 1 link, hoạt động
 * cả khi chưa hydrate xong. Xem src/app/tim-kiem/page.tsx.
 *
 * Dùng chung cho site-header.tsx (thanh nav sticky, hầu hết các trang) và
 * book-coverflow.tsx (trang chủ, thanh nav không sticky, cuộn cùng nội
 * dung) — 2 nơi tự lo phần bleed/nền riêng của thanh nav, chỉ tái dùng
 * phần nội dung bên trong để tránh lệch nhau giữa 2 nơi như trước.
 */
export function NavBarContent({
  showSearch = true,
  searchPlaceholder = "Tìm truyện, tác giả…",
  searchType = "truyen",
  searchDefaultValue,
}: NavBarContentProps) {
  return (
    <>
      <div className="hidden items-center gap-5 lg:flex">
        <NavStripLinks />
      </div>
      <MobileNavDrawer />
      {showSearch && (
        <form
          action="/tim-kiem"
          className="ml-auto flex w-[170px] min-w-0 items-center gap-2 rounded-full bg-white/12 px-3.5 py-2 text-sm text-white/70 focus-within:bg-white/20 sm:w-[220px] lg:w-[240px]"
        >
          <MagnifyingGlassIcon size={16} className="shrink-0" />
          <input
            type="search"
            name="q"
            defaultValue={searchDefaultValue}
            placeholder={searchPlaceholder}
            className="w-full min-w-0 bg-transparent text-white placeholder:text-white/70 focus:outline-none"
          />
          {searchType !== "truyen" && <input type="hidden" name="type" value={searchType} />}
        </form>
      )}
    </>
  );
}
