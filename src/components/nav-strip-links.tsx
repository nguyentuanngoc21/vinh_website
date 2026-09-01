"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MegaMenu, type MegaMenuColumn } from "@/components/mega-menu";
import { BOOK_GENRES } from "@/lib/covers/genre-styles";

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

// Audio/Thiết kế: đúng nội dung mega-menu trong Vịnh Trang chủ.dc.html
// (.vn-mega/.vn-pop). "Truyện chữ": KHÔNG lấy nội dung design mock — dùng
// BOOK_GENRES (src/lib/covers/genre-styles.ts, nguồn thể loại DUY NHẤT
// của hệ thống) để giữ đúng yêu cầu ban đầu "giữ thể loại truyện chữ như
// hiện tại", chỉ thêm hiển thị hover đang thiếu chứ không đổi danh sách
// thể loại. Mọi mục (kể cả từng thể loại) đều trỏ về `href` KHÔNG lọc —
// giống hệt cách Audio/Thiết kế đang làm (chưa có route lọc theo thể
// loại/loại hình thật), nên bấm vào tiêu đề hay bấm vào 1 mục con đều ra
// cùng 1 trang "tất cả", không có mục nào lọc ra kết quả khác nhau.
const MEGA_MENUS: Partial<Record<NavKey, MegaMenuColumn[]>> = {
  home: [{ title: "Thể loại", items: [...BOOK_GENRES] }],
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
