"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ShieldCheckIcon,
  UserCircleIcon,
  NotebookIcon,
  TargetIcon,
  TrophyIcon,
  SignOutIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useRole } from "@/lib/role";
import { NotificationBell } from "@/components/notifications/notification-bell";

export function AuthCluster({
  ctaLabel = "Viết truyện",
  ctaHref = "/author/new",
}: {
  ctaLabel?: string;
  ctaHref?: string;
}) {
  const { session, isGuest, isAdmin, isLogged, logout } = useRole();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Đóng dropdown khi click ra ngoài vùng avatar+menu
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const initial = session?.name?.[0] ?? "?";
  const userName = session?.name ?? "";
  const userHandle = session?.handle ?? "";

  return (
    <>
      {isGuest && (
        <Link
          href="/dang-nhap"
          className="whitespace-nowrap text-[15px] font-medium text-[#3a3a3a] no-underline transition-colors hover:text-brand-gold-dark"
        >
          Đăng nhập
        </Link>
      )}
      {isGuest ? (
        // Chưa đăng nhập: đưa tới trang đăng nhập trước — bấm mở modal
        // ngay sẽ chỉ nhận lỗi 401 khi submit vì tạo truyện cần
        // author_id thật (POST /api/authoring/books).
        <Link
          href="/dang-nhap"
          data-tour="tour-cta"
          className="shrink-0 whitespace-nowrap rounded-full bg-brand-gold px-[22px] py-2.5 text-sm font-semibold text-brand-ink no-underline"
        >
          {ctaLabel}
        </Link>
      ) : (
        // Trước đây là <Link href="/author"> — luôn mở lại đúng 1 trang
        // tĩnh, không phân biệt được "viết truyện mới" với "sửa truyện
        // cũ". Sau đó đổi sang tạo sách ngay (POST) rồi điều hướng — giờ
        // đổi lại lần nữa: chỉ mở /author/new (KHÔNG ghi Supabase), sách
        // chỉ thật sự được tạo lúc bấm Lưu/Xuất bản lần đầu ở đó (xem
        // new-work-workspace.tsx + POST /api/authoring/books).
        <Link
          href={ctaHref}
          data-tour="tour-cta"
          className="shrink-0 whitespace-nowrap rounded-full bg-brand-gold px-[22px] py-2.5 text-sm font-semibold text-brand-ink no-underline"
        >
          {ctaLabel}
        </Link>
      )}
      {isAdmin && (
        <Link
          href="/admin"
          className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-brand-ink px-5 py-2.5 text-sm font-semibold text-white no-underline"
        >
          <ShieldCheckIcon weight="fill" size={16} color="var(--color-brand-gold-light)" /> Bảng
          điều khiển
        </Link>
      )}
      {/* Giữa nút hành động (Viết truyện/...) và avatar, theo đúng vị trí
          yêu cầu — chỉ hiện khi đã đăng nhập (khách chưa có gì để nhận
          thông báo). */}
      {isLogged && <NotificationBell />}
      {isLogged && (
        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            title="Trang cá nhân"
            data-tour="tour-avatar"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-brand-ink text-sm font-bold text-brand-gold-light"
          >
            {initial}
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-[46px] z-[60] w-[236px] overflow-hidden rounded-2xl border border-cream bg-white shadow-[0_14px_34px_rgba(0,0,0,.16)]">
              <div className="border-b border-[#f1efec] px-[18px] pb-3 pt-3.5">
                <div className="text-[14.5px] font-semibold text-ink">
                  {userName}
                </div>
                <div className="mt-0.5 text-[12.5px] text-stone">
                  {userHandle}
                </div>
              </div>
              <Link
                href="/ca-nhan"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-[11px] px-[18px] py-3 text-sm font-medium text-ink no-underline transition-colors hover:bg-cream-card"
              >
                <UserCircleIcon size={18} color="var(--color-stone)" /> Thông tin cá nhân
              </Link>
              {/* Tách khỏi tab "Nhiệm vụ ngày" cũ trong Thông tin cá nhân —
                  giờ là 2 điểm đến riêng, cùng cấp với Thông tin cá nhân/
                  Trang viết truyện (xem src/lib/profile.ts). */}
              <Link
                href="/nhiem-vu"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-[11px] px-[18px] py-3 text-sm font-medium text-ink no-underline transition-colors hover:bg-cream-card"
              >
                <TargetIcon size={18} color="var(--color-stone)" /> Nhiệm vụ
              </Link>
              <Link
                href="/thanh-tuu"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-[11px] px-[18px] py-3 text-sm font-medium text-ink no-underline transition-colors hover:bg-cream-card"
              >
                <TrophyIcon size={18} color="var(--color-stone)" /> Thành tựu
              </Link>
              <Link
                href="/author"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-[11px] px-[18px] py-3 text-sm font-medium text-ink no-underline transition-colors hover:bg-cream-card"
              >
                {/* Trước đây ghi "Cài đặt tài khoản" nhưng lại trỏ tới
                    /author (trang viết truyện) — nhãn sai, khiến tác giả
                    không biết đây chính là nơi có "Tác phẩm của tôi". Đổi
                    tên đúng với nơi nó dẫn tới; "/ca-nhan" ở trên mới là
                    cài đặt tài khoản thật. */}
                <NotebookIcon size={18} color="var(--color-stone)" /> Trang viết truyện
              </Link>
              <button
                type="button"
                onClick={() => {
                  logout();
                  setMenuOpen(false);
                }}
                className="flex w-full cursor-pointer items-center gap-[11px] border-t border-[#f1efec] px-[18px] py-3 text-left text-sm font-medium text-[#B02A37] transition-colors hover:bg-cream-card"
              >
                <SignOutIcon size={18} /> Đăng xuất
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
