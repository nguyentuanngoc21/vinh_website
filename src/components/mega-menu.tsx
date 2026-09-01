"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

export type MegaMenuColumn = { title: string; items: string[] };

type MegaMenuProps = {
  label: string;
  href: string;
  triggerClassName: string;
  columns: MegaMenuColumn[];
};

/**
 * Dropdown khi hover "Audio"/"Thiết kế" ở nav dùng chung (đúng thiết kế
 * Vịnh Trang chủ.dc.html — mega-menu .vn-mega/.vn-pop). "Truyện chữ" CỐ Ý
 * không có dropdown này — giữ nguyên như hiện tại theo yêu cầu ban đầu
 * (không đổi cách hiển thị thể loại), chỉ Audio/Thiết kế được thêm.
 *
 * Render qua createPortal vào document.body thay vì position:absolute
 * tại chỗ — nav strip cha có overflow-x-auto (cuộn ngang trên mobile),
 * bất kỳ overflow nào khác "visible" trên 1 trục sẽ khiến trục còn lại
 * cũng bị tính lại thành "auto" (CSS overflow spec), tức dropdown cao hơn
 * thanh nav sẽ bị cắt mất nếu đặt absolute ngay trong nav. Portal thoát
 * hẳn khỏi mọi overflow của tổ tiên.
 */
export function MegaMenu({ label, href, triggerClassName, columns }: MegaMenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const triggerRef = useRef<HTMLAnchorElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setPos({ left: rect.left, top: rect.bottom + 8 });
    setOpen(true);
  };
  const scheduleHide = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  return (
    <>
      <Link
        ref={triggerRef}
        href={href}
        className={`${triggerClassName} inline-flex items-center gap-1.5`}
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
      >
        {label}
        <span className={`text-[10px] transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </Link>
      {open &&
        createPortal(
          <div
            onMouseEnter={show}
            onMouseLeave={scheduleHide}
            style={{ position: "fixed", left: pos.left, top: pos.top, zIndex: 70 }}
            className="min-w-[420px] rounded-2xl border border-cream bg-white p-6 shadow-[0_18px_44px_rgba(20,59,77,0.18)]"
          >
            <div className="grid grid-cols-2 gap-8">
              {columns.map((col) => (
                <div key={col.title}>
                  <div className="mb-3 text-[13.5px] font-bold text-brand-ink">{col.title}</div>
                  <div className="flex flex-col gap-2">
                    {col.items.map((item) => (
                      <Link
                        key={item}
                        href={href}
                        className="text-[13.5px] text-[#3a3a3a] no-underline transition-colors hover:text-brand-gold-dark"
                        onClick={() => setOpen(false)}
                      >
                        {item}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
