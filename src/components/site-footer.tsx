"use client";

import Link from "next/link";
import { FacebookLogoIcon, YoutubeLogoIcon, InstagramLogoIcon } from "@phosphor-icons/react/dist/ssr";
import { LegalLink } from "@/components/legal/legal-link";
import { VinhMark } from "@/components/ui";

type FooterLink = {
  label: string;
  href?: string;
  legalDoc?: "terms" | "privacy";
};

const LINK_COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Khám phá",
    links: [
      { label: "Truyện chữ", href: "/truyen" },
      { label: "Truyện audio", href: "/audio" },
      { label: "Blog", href: "/blog" },
      { label: "Bảng xếp hạng", href: "/rankings" },
    ],
  },
  {
    title: "Tác giả",
    links: [
      { label: "Đăng tác phẩm", href: "/author" },
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
      { label: "Liên hệ", href: "/ket-noi" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="bg-ink px-4 pb-9 pt-12 text-[#c9c3bd] sm:px-8 lg:px-11">
      <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Link href="/" className="mb-3 flex items-center gap-2 text-2xl font-extrabold text-brand-gold no-underline">
            <VinhMark size={26} tone="cream" />
            Vịnh
          </Link>
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
                ) : link.href ? (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="text-[#c9c3bd] no-underline transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                ) : (
                  <span
                    key={link.label}
                    title="Sắp có"
                    aria-disabled="true"
                    className="cursor-default text-[#6b635a]"
                  >
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
