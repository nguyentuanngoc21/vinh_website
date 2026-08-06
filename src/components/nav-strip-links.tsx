"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavKey = "home" | "audio" | "blog" | "design" | "connect" | "rankings";

type NavItem = { key: NavKey; label: string; href: string };

const NAV_ITEMS: NavItem[] = [
  { key: "home", label: "Truyện chữ", href: "/" },
  { key: "audio", label: "Audio", href: "/audio" },
  { key: "blog", label: "Blog", href: "/blog" },
  { key: "design", label: "Thiết kế", href: "/thiet-ke" },
  { key: "connect", label: "Kết nối", href: "/ket-noi" },
  { key: "rankings", label: "Bảng xếp hạng", href: "/rankings" },
];

// Active tab is derived from the current route, not passed in per page —
// so a page can never drift out of sync with where it actually lives.
function deriveActive(pathname: string): NavKey | undefined {
  if (pathname === "/") return "home";
  return NAV_ITEMS.find((item) => item.href !== "/" && pathname.startsWith(item.href))?.key;
}

export function NavStripLinks() {
  const pathname = usePathname();
  const active = deriveActive(pathname);

  return (
    <>
      {NAV_ITEMS.map((item) => {
        const isActive = item.key === active;
        const className = isActive
          ? "shrink-0 whitespace-nowrap border-b-2 border-brand-gold pb-0.5 font-bold text-brand-gold-light no-underline"
          : "shrink-0 whitespace-nowrap text-[#DDE6EA] no-underline transition-colors hover:text-brand-gold-light";
        return (
          <Link key={item.key} href={item.href} className={className}>
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
