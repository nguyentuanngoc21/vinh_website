import Link from "next/link";
import { FireIcon, HeadphonesIcon, FingerprintIcon } from "@phosphor-icons/react/dist/ssr";

export function HeroTrending() {
  return (
    <section className="px-11 pb-7 pt-10">
      <div className="grid grid-cols-1 items-center gap-12 rounded-[22px] bg-ink p-8 text-white sm:p-12 lg:grid-cols-[1fr_280px]">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-brand-gold/18 px-3.5 py-1.5 text-xs font-semibold text-brand-gold-light">
            <FireIcon weight="fill" /> THỊNH HÀNH #1 TUẦN NÀY
          </div>
          <h1 className="mt-5 mb-3.5 text-4xl font-bold leading-[1.08] tracking-[-1.2px] sm:text-[52px]">
            Vũng Vịnh Cuối Trời
          </h1>
          <p className="max-w-[540px] text-[17px] leading-[1.65] text-[#c9c3bd]">
            Mười hai mùa gió, một lời hứa chưa trọn. Một thiên truyện về biển
            và những người ở lại — được bảo hộ bản quyền bằng watermark động
            theo từng phiên đọc.
          </p>
          <div className="mt-[22px] flex items-center gap-3.5 text-sm font-medium text-[#c9c3bd]">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#c8a86a] font-bold text-white">
              M
            </div>
            Minh Khôi · 248k đọc · 4.8★ · 36 chương
          </div>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/read"
              className="rounded-full bg-brand-gold px-[30px] py-3.5 text-[15px] font-semibold text-brand-ink no-underline"
            >
              Đọc ngay
            </Link>
            <Link
              href="/audio/now-playing"
              className="flex items-center gap-2 rounded-full border border-white/30 px-[26px] py-3.5 text-[15px] font-semibold text-white no-underline"
            >
              <HeadphonesIcon /> Nghe audio
            </Link>
          </div>
        </div>
        <div className="relative">
          <div className="flex h-[220px] items-end rounded-2xl bg-gradient-to-br from-info to-success p-6 font-[family-name:var(--font-lora)] text-xl font-bold leading-[1.2] shadow-[0_24px_48px_rgba(0,0,0,.45)] sm:h-[340px] sm:text-2xl">
            Vũng Vịnh Cuối Trời
          </div>
          <div className="absolute -right-2.5 -top-2.5 flex h-16 w-16 flex-col items-center justify-center rounded-full bg-brand-ink text-center text-[11px] font-bold leading-tight text-brand-gold-light shadow-[0_6px_16px_rgba(0,0,0,.3)]">
            <FingerprintIcon weight="fill" size={22} />
            ĐÃ BẢO HỘ
          </div>
        </div>
      </div>
    </section>
  );
}
