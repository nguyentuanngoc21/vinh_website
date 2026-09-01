"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { CaretDownIcon } from "@phosphor-icons/react/dist/ssr";

export type MegaMenuColumn = { title: string; items: string[] };

type MegaMenuProps = {
  label: string;
  href: string;
  triggerClassName: string;
  columns: MegaMenuColumn[];
};

/**
 * Dropdown khi hover 1 mục ở nav dùng chung — Audio/Thiết kế lấy đúng nội
 * dung mega-menu trong Vịnh Trang chủ.dc.html (.vn-mega/.vn-pop); "Truyện
 * chữ" dùng danh sách thể loại THẬT của hệ thống (BOOK_GENRES, xem
 * src/lib/covers/genre-styles.ts) thay vì nội dung design mock — bám đúng
 * yêu cầu ban đầu "giữ thể loại truyện chữ như hiện tại", chỉ thêm phần
 * hiển thị hover còn đang thiếu.
 *
 * Icon mũi tên (không dùng glyph Unicode "▾" nữa — render mờ/trông như
 * dấu chấm ở size nhỏ tùy font) báo cho người dùng biết mục này có danh
 * sách con khi hover; chỉ những mục truyền `columns` mới có icon này.
 *
 * `columns.length === 1` (trường hợp Truyện chữ — 1 danh sách thể loại
 * phẳng, không chia 2 nhóm như Audio/Thiết kế) thì bỏ lưới 2 cột, dùng 1
 * cột dọc cho gọn thay vì để trống nửa còn lại.
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
        <CaretDownIcon size={11} weight="bold" className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </Link>
      {open &&
        createPortal(
          <div
            onMouseEnter={show}
            onMouseLeave={scheduleHide}
            style={{ position: "fixed", left: pos.left, top: pos.top, zIndex: 70 }}
            className={`rounded-2xl border border-cream bg-white p-6 shadow-[0_18px_44px_rgba(20,59,77,0.18)] ${
              columns.length > 1 ? "min-w-[420px]" : "min-w-[240px]"
            }`}
          >
            <div className={columns.length > 1 ? "grid grid-cols-2 gap-8" : "flex flex-col"}>
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
