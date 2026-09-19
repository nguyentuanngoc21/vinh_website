"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MegaMenu, type MegaMenuColumn } from "@/components/mega-menu";
import { BOOK_GENRES, GENRE_SLUGS } from "@/lib/covers/genre-styles";
import { DESIGN_CATEGORIES } from "@/lib/design/get-design-gallery";
import { ART_STYLES } from "@/lib/design/art-styles";

export type NavKey = "home" | "audio" | "blog" | "design" | "connect" | "rankings";

export type NavItem = { key: NavKey; label: string; href: string };

// Exported (cùng MEGA_MENUS, deriveActive bên dưới) để mobile-nav-drawer.tsx
// dựng lại đúng danh sách nav/mega-menu bên trong drawer mobile — dùng
// chung 1 nguồn dữ liệu thay vì chép lại, tránh 2 nơi lệch nhau.
export const NAV_ITEMS: NavItem[] = [
  { key: "home", label: "Truyện chữ", href: "/" },
  { key: "audio", label: "Audio", href: "/audio" },
  { key: "blog", label: "Blog", href: "/blog" },
  { key: "design", label: "Thiết kế", href: "/thiet-ke" },
  { key: "connect", label: "Kết nối", href: "/ket-noi" },
  { key: "rankings", label: "Bảng xếp hạng", href: "/rankings" },
];

// Audio/Thiết kế: đúng nội dung mega-menu trong Vịnh Trang chủ.dc.html
// (.vn-mega/.vn-pop) — mọi mục con vẫn trỏ về `href` KHÔNG lọc (chưa có
// route lọc theo loại hình thật). "Truyện chữ": KHÔNG lấy nội dung design
// mock — dùng BOOK_GENRES (src/lib/covers/genre-styles.ts, nguồn thể loại
// DUY NHẤT của hệ thống); mỗi thể loại giờ trỏ tới `/truyen?the-loai=<slug>`
// RIÊNG (route lọc thật — xem src/app/truyen/page.tsx), khác với Audio/
// Thiết kế ở trên.
export const MEGA_MENUS: Partial<Record<NavKey, MegaMenuColumn[]>> = {
  home: [
    {
      title: "Thể loại",
      items: BOOK_GENRES.map((genre) => ({ label: genre, href: `/truyen?the-loai=${GENRE_SLUGS[genre]}` })),
    },
  ],
  audio: [
    { title: "Lồng tiếng", items: ["Người kể chuyện", "Thoại nhân vật một giọng", "Thoại nhân vật nhiều giọng"] },
    { title: "Nhạc cụ", items: ["Sáo", "Piano", "Trống"] },
  ],
  design: [
    {
      title: "Loại sản phẩm",
      // Nguồn thật giờ là design_items.category (xem
      // migrations/20260919_add_design_albums_and_multi_upload.sql) — chỉ
      // lấy 12 mục đầu của DESIGN_CATEGORIES, bỏ 2 mục cuối ("Minh họa"/
      // "Poster audio") vốn là 2 giá trị cũ giữ lại cho dữ liệu sẵn có,
      // không thuộc nội dung mega-menu gốc.
      items: DESIGN_CATEGORIES.slice(0, 12).map((c) => c.label),
    },
    {
      title: "Phong cách nghệ thuật",
      items: ART_STYLES.map((s) => s.label),
    },
  ],
};

// Active tab is derived from the current route, not passed in per page —
// so a page can never drift out of sync with where it actually lives.
export function deriveActive(pathname: string): NavKey | undefined {
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
        const columns = MEGA_MENUS[item.key];
        if (columns) {
          return (
            <MegaMenu key={item.key} label={item.label} href={item.href} triggerClassName={className} columns={columns} />
          );
        }
        return (
          <Link key={item.key} href={item.href} className={className}>
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
