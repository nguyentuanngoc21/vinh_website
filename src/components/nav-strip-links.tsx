"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MegaMenu, type MegaMenuColumn } from "@/components/mega-menu";

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

// Đúng nội dung mega-menu trong Vịnh Trang chủ.dc.html (.vn-mega/.vn-pop)
// — CHỈ Audio/Thiết kế có dropdown này, "Truyện chữ" giữ nguyên không đổi
// (yêu cầu ban đầu: giữ thể loại truyện chữ như hiện tại, không theo
// thiết kế cho mục này).
const MEGA_MENUS: Partial<Record<NavKey, MegaMenuColumn[]>> = {
  audio: [
    { title: "Lồng tiếng", items: ["Người kể chuyện", "Thoại nhân vật một giọng", "Thoại nhân vật nhiều giọng"] },
    { title: "Nhạc cụ", items: ["Sáo", "Piano", "Trống"] },
  ],
  design: [
    {
      title: "Loại sản phẩm",
      items: [
        "Bìa truyện/sách",
        "Nhân vật đơn (character art)",
        "Nhân vật nhóm / cảnh nhiều người",
        "Vũ khí / trang bị",
        "Bối cảnh / phong cảnh",
        "Linh vật / thú cưng giả tưởng",
        "Trang phục / thiết kế thời trang",
        "Chibi / deform",
        "Biểu tượng cảm xúc (emote pack)",
        "Logo / huy hiệu / icon",
        "Fanart",
        "Tranh đôi / couple art",
      ],
    },
    {
      title: "Phong cách nghệ thuật",
      items: [
        "Anime / manga",
        "Bán tả thực",
        "Tả thực",
        "Chibi",
        "Phẳng / vector (flat design)",
        "Cổ trang / historical",
        "Dark fantasy / gothic",
        "Pixel art",
        "Tranh vẽ tay (painterly / màu nước)",
        "3D / render",
      ],
    },
  ],
};

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
