import type { Metadata } from "next";
import { Suspense } from "react";
import { Lora } from "next/font/google";
import Link from "next/link";
import {
  IdentificationCardIcon,
  LockKeyIcon,
  CoinsIcon,
} from "@phosphor-icons/react/dist/ssr";
import { RegisterForm } from "@/components/register/register-form";
import { LegalLink } from "@/components/legal/legal-link";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "vietnamese"],
  weight: ["600"],
});

export const metadata: Metadata = {
  title: "Đăng ký — Vịnh",
};

export default function RegisterPage() {
  return (
    <div className={`${lora.variable} grid flex-1 grid-cols-1 bg-white lg:grid-cols-[1fr_1.15fr]`}>
      <div className="relative hidden flex-col justify-between gap-10 overflow-hidden bg-brand-ink-dark p-14 text-white lg:flex lg:gap-0 lg:p-[56px_60px]">
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
            TẠO TÀI KHOẢN
          </div>
          <div className="mt-4 max-w-[400px] font-[family-name:var(--font-lora)] text-[36px] font-semibold leading-[1.28]">
            Xác thực một lần, rồi cứ thế mà viết.
          </div>
          <div className="mt-[30px] flex max-w-[380px] flex-col gap-3.5 text-[14.5px] leading-[1.5] text-sidebar-text-dim-2">
            <div className="flex gap-[11px]">
              <IdentificationCardIcon weight="fill" size={19} className="shrink-0 text-brand-gold-light" />
              Căn cước chỉ dùng để xác minh bản quyền, không hiển thị công khai
            </div>
            <div className="flex gap-[11px]">
              <LockKeyIcon weight="fill" size={19} className="shrink-0 text-brand-gold-light" />
              Ảnh giấy tờ được mã hóa và tự xóa sau 90 ngày
            </div>
            <div className="flex gap-[11px]">
              <CoinsIcon weight="fill" size={19} className="shrink-0 text-brand-gold-light" />
              Nhận 100 token chào mừng khi xác thực xong
            </div>
          </div>
        </div>

        <div className="relative text-[13px] text-[#7d94a0]">
          © 2026 Vịnh · <LegalLink doc="terms" className="text-[#7d94a0] hover:text-white">Điều khoản</LegalLink> ·{" "}
          <LegalLink doc="privacy" className="text-[#7d94a0] hover:text-white">Bảo mật</LegalLink>
        </div>
      </div>

      <div className="flex flex-col justify-center p-6 py-10 sm:p-14">
        <Suspense fallback={null}>
          <RegisterForm />
        </Suspense>
      </div>
    </div>
  );
}
