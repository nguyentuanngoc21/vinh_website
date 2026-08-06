"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ShieldCheckIcon,
  UserCircleIcon,
  GearIcon,
  SignOutIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useRole } from "@/lib/role";

export function AuthCluster({ ctaLabel = "Viết truyện" }: { ctaLabel?: string }) {
  const { session, isGuest, isAdmin, isLogged, logout } = useRole();
  const [menuOpen, setMenuOpen] = useState(false);

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
      <Link
        href="/author"
        className="shrink-0 whitespace-nowrap rounded-full bg-brand-gold px-[22px] py-2.5 text-sm font-semibold text-brand-ink no-underline"
      >
        {ctaLabel}
      </Link>
      {isAdmin && (
        <Link
          href="/admin"
          className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-brand-ink px-5 py-2.5 text-sm font-semibold text-white no-underline"
        >
          <ShieldCheckIcon weight="fill" size={16} color="var(--color-brand-gold-light)" /> Bảng
          điều khiển
        </Link>
      )}
      {isLogged && (
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            title="Trang cá nhân"
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
              <Link
                href="/author"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-[11px] px-[18px] py-3 text-sm font-medium text-ink no-underline transition-colors hover:bg-cream-card"
              >
                <GearIcon size={18} color="var(--color-stone)" /> Cài đặt tài khoản
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
