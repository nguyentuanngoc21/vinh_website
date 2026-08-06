import { FacebookLogoIcon, YoutubeLogoIcon, InstagramLogoIcon } from "@phosphor-icons/react/dist/ssr";

const LINK_COLUMNS = [
  {
    title: "Khám phá",
    links: ["Truyện chữ", "Truyện audio", "Blog", "Bảng xếp hạng"],
  },
  {
    title: "Tác giả",
    links: [
      "Đăng tác phẩm",
      "Bản quyền & bảo hộ",
      "Quyền lợi tác giả",
      "Hướng dẫn",
    ],
  },
  {
    title: "Hỗ trợ",
    links: ["Trung tâm trợ giúp", "Điều khoản", "Bảo mật", "Liên hệ"],
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
              {col.links.map((link) => (
                <span key={link} className="cursor-default">
                  {link}
                </span>
              ))}
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
