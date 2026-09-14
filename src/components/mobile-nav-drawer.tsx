"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ListIcon, XIcon, CaretDownIcon } from "@phosphor-icons/react/dist/ssr";
import { NAV_ITEMS, MEGA_MENUS, deriveActive, type NavKey } from "@/components/nav-strip-links";
import { itemLabel, itemHref } from "@/components/mega-menu";

/**
 * Hamburger + drawer trượt vào từ bên phải, chỉ hiện dưới `lg` — nằm ở đầu
 * thanh nav màu brand-ink (xem nav-bar-content.tsx), thay cho việc liệt kê
 * đủ link điều hướng ở mobile. Bookmark/AuthCluster KHÔNG nằm trong drawer
 * này — chúng luôn hiện sẵn ở hàng trên (logo) tại mọi kích thước màn
 * hình, không cần lặp lại ở đây.
 *
 * Từ `lg` trở lên component này không render gì (nút hamburger có class
 * `lg:hidden`, drawer chỉ mở qua nút đó nên không thể mở ở desktop).
 *
 * Kỹ thuật slide-in tham khảo works-sidebar.tsx (KHÔNG sửa file đó) nhưng
 * đảo chiều: trượt từ phải sang (translate-x-full → translate-x-0) để khớp
 * hướng nút hamburger đặt ở rìa phải.
 */
export function MobileNavDrawer() {
  const pathname = usePathname();
  const active = deriveActive(pathname);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<NavKey | null>(null);

  // Backdrop + aside render qua portal thẳng vào document.body (xem bên
  // dưới) — header cha có `backdrop-blur` (backdrop-filter), mà theo CSS
  // spec, backdrop-filter khác none trên 1 tổ tiên sẽ tạo containing block
  // mới cho `position: fixed` của con cháu. Không portal ra ngoài, drawer
  // sẽ bị "nhốt" trong khung header thay vì phủ toàn viewport. `mounted`
  // tránh portal chạy lúc SSR (document chưa tồn tại).
  const [mounted, setMounted] = useState(false);
  // Không thể bỏ effect này (vd đọc `typeof document` thẳng lúc render) —
  // sẽ lệch giữa lần render server (document không tồn tại) và lần
  // render đầu ở client (document đã có ngay cả trước khi effect chạy),
  // gây hydration mismatch. Đây là pattern "chỉ mount ở client" chuẩn cho
  // portal, không phải effect dùng sai chỗ.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  // Tự đóng drawer mỗi khi chuyển trang. Set state trong lúc render theo
  // đúng pattern đã dùng ở works-sidebar.tsx (xem comment ở đó).
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    if (open) setOpen(false);
  }

  const closeDrawer = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Mở menu"
        className="shrink-0 cursor-pointer rounded-md p-1 text-white lg:hidden"
      >
        <ListIcon size={24} />
      </button>

      {mounted &&
        createPortal(
          <>
            {open && (
              <div
                onClick={closeDrawer}
                aria-hidden
                className="fixed inset-0 z-40 bg-black/45 lg:hidden"
              />
            )}

            <aside
              className={`fixed inset-y-0 right-0 z-50 flex w-[280px] max-w-[85vw] flex-col overflow-y-auto bg-white shadow-[-18px_0_44px_rgba(20,59,77,0.18)] transition-transform duration-200 lg:hidden ${
                open ? "translate-x-0" : "translate-x-full"
              }`}
            >
              <div className="flex items-center justify-between border-b border-[#f0f0f0] px-5 py-4">
                <span className="text-[15px] font-extrabold text-brand-ink">Menu</span>
                <button
                  type="button"
                  onClick={closeDrawer}
                  aria-label="Đóng menu"
                  className="cursor-pointer rounded-md p-1 text-[#3a3a3a]"
                >
                  <XIcon size={20} />
                </button>
              </div>

              <nav className="flex flex-col px-2 py-2">
                {NAV_ITEMS.map((item) => {
                  const isActive = item.key === active;
                  const columns = MEGA_MENUS[item.key];
                  const linkClassName = `flex-1 whitespace-nowrap px-3 py-3 text-[15px] no-underline ${
                    isActive ? "font-bold text-brand-gold-dark" : "font-medium text-brand-ink"
                  }`;

                  if (!columns) {
                    return (
                      <Link key={item.key} href={item.href} onClick={closeDrawer} className={linkClassName}>
                        {item.label}
                      </Link>
                    );
                  }

                  const isExpanded = expanded === item.key;
                  return (
                    <div key={item.key} className="border-b border-[#f5f5f5] last:border-b-0">
                      <div className="flex items-center">
                        <Link href={item.href} onClick={closeDrawer} className={linkClassName}>
                          {item.label}
                        </Link>
                        <button
                          type="button"
                          onClick={() => setExpanded(isExpanded ? null : item.key)}
                          aria-label={isExpanded ? `Thu gọn ${item.label}` : `Mở rộng ${item.label}`}
                          aria-expanded={isExpanded}
                          className="cursor-pointer px-3 py-3 text-[#3a3a3a]"
                        >
                          <CaretDownIcon
                            size={14}
                            weight="bold"
                            className={`shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          />
                        </button>
                      </div>
                      {isExpanded && (
                        <div className="flex flex-col gap-3 px-4 pb-3 pt-1">
                          {columns.map((col) => (
                            <div key={col.title}>
                              <div className="mb-1.5 text-[12.5px] font-bold text-brand-ink">{col.title}</div>
                              <div className="flex flex-col gap-2">
                                {col.items.map((subItem) => (
                                  <Link
                                    key={itemLabel(subItem)}
                                    href={itemHref(subItem, item.href)}
                                    onClick={closeDrawer}
                                    className="text-[13.5px] text-[#3a3a3a] no-underline transition-colors hover:text-brand-gold-dark"
                                  >
                                    {itemLabel(subItem)}
                                  </Link>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </nav>
            </aside>
          </>,
          document.body,
        )}
    </>
  );
}
