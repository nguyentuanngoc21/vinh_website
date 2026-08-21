"use client";

import { FacebookLogoIcon, YoutubeLogoIcon, InstagramLogoIcon } from "@phosphor-icons/react/dist/ssr";
import { LegalLink } from "@/components/legal/legal-link";

type FooterLink = { label: string; legalDoc?: "terms" | "privacy" };

const LINK_COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Khám phá",
    links: [
      { label: "Truyện chữ" },
      { label: "Truyện audio" },
      { label: "Blog" },
      { label: "Bảng xếp hạng" },
    ],
  },
  {
    title: "Tác giả",
    links: [
      { label: "Đăng tác phẩm" },
      { label: "Bản quyền & bảo hộ" },
      { label: "Quyền lợi tác giả" },
      { label: "Hướng dẫn" },
    ],
  },
  {
    title: "Hỗ trợ",
    links: [
      { label: "Trung tâm trợ giúp" },
      { label: "Điều khoản", legalDoc: "terms" },
      { label: "Bảo mật", legalDoc: "privacy" },
      { label: "Liên hệ" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="bg-ink px-11 pb-9 pt-12 text-[#c9c3bd]">
      <div className="grid grid-cols-1 gap-10 sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="mb-3 text-2xl font-extrabold text-brand-gold">
            Vịnh
          </div>
          <p className="max-w-[280px] text-sm leading-[1.6]">
            Nền tảng truyện chữ, truyện audio và blog — nơi tác giả Việt sáng
            tác và được bảo hộ bản quyền.
          </p>
          <div className="mt-[18px] flex gap-3.5">
            <FacebookLogoIcon weight="fill" size={22} />
            <YoutubeLogoIcon weight="fill" size={22} />
            <InstagramLogoIcon weight="fill" size={22} />
          </div>
        </div>
        {LINK_COLUMNS.map((col) => (
          <div key={col.title}>
            <div className="mb-3.5 text-[15px] font-semibold text-white">
              {col.title}
            </div>
            <div className="flex flex-col gap-2.5 text-sm">
              {col.links.map((link) =>
                link.legalDoc ? (
                  <LegalLink key={link.label} doc={link.legalDoc} className="text-left text-[#c9c3bd] hover:text-white">
                    {link.label}
                  </LegalLink>
                ) : (
                  <span key={link.label} className="cursor-default">
                    {link.label}
                  </span>
                ),
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-9 border-t border-[#2a241c] pt-5 text-[13px] text-[#8a7f6c]">
        © 2026 Vịnh. Mọi tác phẩm đều được bảo hộ bản quyền.
      </div>
    </footer>
  );
}
