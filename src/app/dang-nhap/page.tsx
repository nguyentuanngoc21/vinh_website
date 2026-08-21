import type { Metadata } from "next";
import { Lora } from "next/font/google";
import Link from "next/link";
import { FingerprintIcon, HeadphonesIcon, ChartLineUpIcon } from "@phosphor-icons/react/dist/ssr";
import { LoginForm } from "@/components/login/login-form";
import { LegalLink } from "@/components/legal/legal-link";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "vietnamese"],
  weight: ["600"],
});

export const metadata: Metadata = {
  title: "Đăng nhập — Vịnh",
};

export default function LoginPage() {
  return (
    <div className={`${lora.variable} grid flex-1 grid-cols-1 bg-white lg:grid-cols-2`}>
      <div className="relative flex flex-col justify-between gap-10 overflow-hidden bg-brand-ink-dark p-9 text-white sm:p-14 lg:gap-0 lg:p-[56px_60px]">
        <div
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(circle at 35% 35%, rgba(217,164,65,.22), transparent 65%)",
          }}
          className="pointer-events-none absolute -bottom-40 -right-36 h-[520px] w-[520px] rounded-full"
        />
        <Link href="/" className="relative flex items-center gap-[11px] text-inherit no-underline">
          <svg width="40" height="40" viewBox="0 0 100 100" className="shrink-0">
            <circle cx="50" cy="50" r="48" fill="var(--color-cream-card-alt)" />
            <path
              d="M50,98 A48,48 0 0 1 50,2 A24,24 0 0 1 50,50 A24,24 0 0 0 50,98 Z"
              fill="var(--color-brand-ink-dark)"
            />
            <circle cx="44" cy="24" r="3" fill="var(--color-cream-card-alt)" />
          </svg>
          <div className="text-[30px] font-extrabold tracking-[-0.5px]">Vịnh</div>
        </Link>

        <div className="relative">
          <div className="text-[13px] font-medium tracking-[1.4px] text-brand-gold-light">
            TRUYỆN CHỮ · AUDIO · BLOG
          </div>
          <div className="mt-4 max-w-[420px] font-[family-name:var(--font-lora)] text-[32px] font-semibold leading-[1.25] sm:text-[38px]">
            Nơi người Việt kể chuyện và giữ được quyền trên chữ của mình.
          </div>
          <div className="mt-[30px] flex max-w-[400px] flex-col gap-3.5 text-[14.5px] leading-[1.5] text-sidebar-text-dim-2">
            <div className="flex gap-[11px]">
              <FingerprintIcon weight="fill" size={19} className="shrink-0 text-brand-gold-light" />
              Watermark động gắn với từng phiên đọc
            </div>
            <div className="flex gap-[11px]">
              <HeadphonesIcon weight="fill" size={19} className="shrink-0 text-brand-gold-light" />
              Nghe tiếp đúng chỗ đang dở trên mọi thiết bị
            </div>
            <div className="flex gap-[11px]">
              <ChartLineUpIcon weight="fill" size={19} className="shrink-0 text-brand-gold-light" />
              Chỉ số lượt đọc minh bạch cho tác giả
            </div>
          </div>
        </div>

        <div className="relative text-[13px] text-[#7d94a0]">
          © 2026 Vịnh · <LegalLink doc="terms" className="text-[#7d94a0] hover:text-white">Điều khoản</LegalLink> ·{" "}
          <LegalLink doc="privacy" className="text-[#7d94a0] hover:text-white">Bảo mật</LegalLink>
        </div>
      </div>

      <div className="flex flex-col justify-center p-9 sm:p-14 lg:p-[56px_72px]">
        <LoginForm />
      </div>
    </div>
  );
}
