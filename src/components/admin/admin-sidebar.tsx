"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartLineUpIcon,
  ReceiptIcon,
  BooksIcon,
  UsersThreeIcon,
  ShieldCheckIcon,
  GearIcon,
} from "@phosphor-icons/react/dist/ssr";

// Only "Tổng quan" has a real page today (src/app/admin/page.tsx). The rest
// are placeholders — give them `href` once their /admin/<route>/page.tsx
// exists, and the active-state check below (which compares against the
// real pathname) will pick them up automatically.
const NAV_ITEMS = [
  { label: "Tổng quan", icon: ChartLineUpIcon, href: "/admin" },
  { label: "Giao dịch", icon: ReceiptIcon, href: null },
  { label: "Nội dung", icon: BooksIcon, href: null },
  { label: "Người dùng", icon: UsersThreeIcon, href: null },
  { label: "Bản quyền", icon: ShieldCheckIcon, href: null },
  { label: "Cài đặt", icon: GearIcon, href: null },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col bg-brand-ink-dark pb-4 text-sidebar-text">
      <Link
        href="/"
        className="flex items-center gap-[9px] border-b border-white/10 px-5 py-[18px]"
      >
        <svg width="30" height="30" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="48" fill="var(--color-brand-ink)" />
          <path
            d="M50,98 A48,48 0 0 1 50,2 A24,24 0 0 1 50,50 A24,24 0 0 0 50,98 Z"
            fill="var(--color-cream-card-alt)"
          />
          <circle cx="44" cy="24" r="3" fill="var(--color-brand-ink)" />
        </svg>
        <span className="text-[19px] font-extrabold text-white">Vịnh</span>
        <span className="ml-auto rounded-[5px] border border-brand-gold-light/40 px-[7px] py-0.5 text-[11px] font-medium text-brand-gold-light">
          Admin
        </span>
      </Link>

      <nav className="flex flex-col gap-[3px] p-3">
        {NAV_ITEMS.map(({ label, icon: Icon, href }) => {
          const active = href !== null && pathname === href;
          const itemClass = `flex items-center gap-3 rounded-[9px] px-[14px] py-[11px] text-sm font-medium ${
            active
              ? "bg-brand-gold-light/14 text-white"
              : href
                ? "text-[#9fb3bd] transition-colors hover:bg-white/6"
                : "cursor-not-allowed text-[#9fb3bd]/40"
          }`;
          const content = (
            <>
              <Icon size={18} weight={active ? "fill" : "regular"} color={active ? "var(--color-brand-gold-light)" : undefined} />
              {label}
              {!href && <span className="ml-auto text-[10px] font-normal">Sắp có</span>}
            </>
          );
          return href ? (
            <Link key={label} href={href} className={itemClass}>
              {content}
            </Link>
          ) : (
            <div key={label} className={itemClass} aria-disabled>
              {content}
            </div>
          );
        })}
      </nav>

      <div className="mt-auto flex items-center gap-2.5 border-t border-white/10 px-5 py-[14px]">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-gold-light text-[13px] font-bold text-brand-ink-dark">
          A
        </div>
        <div>
          <div className="text-[13px] font-semibold text-white">Quản trị</div>
          <div className="text-[11px] text-[#6f8794]">admin@vinh.vn</div>
        </div>
      </div>
    </aside>
  );
}
