"use client";

import Link from "next/link";
import { LockKeyIcon, XIcon } from "@phosphor-icons/react/dist/ssr";

type LoginGateModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  /** Đường dẫn quay lại sau khi đăng nhập xong (LoginForm đọc qua
   * searchParams `next` — xem src/app/dang-nhap/page.tsx). */
  returnTo: string;
  /** "Mua chương X token" cần mua trước, không chỉ đăng nhập là đọc được
   * ngay — đổi nhãn nút chính cho đúng bước tiếp theo thật sự. */
  primaryLabel?: string;
};

/**
 * Modal "đăng nhập để đọc/nghe tiếp" — cùng khung backdrop/panel với
 * src/components/topup/custom-amount-modal.tsx (công thức chung của repo:
 * fixed inset-0 + overlay + panel giữa màn hình, xem comment ở
 * reading-list-modal.tsx). Dùng chung cho cả rào đọc chương (reading-gate.tsx)
 * và rào nghe audio (now-playing.tsx, mini-player-bar.tsx).
 */
export function LoginGateModal({
  open,
  onClose,
  title,
  description,
  returnTo,
  primaryLabel = "Đăng nhập",
}: LoginGateModalProps) {
  if (!open) return null;

  const loginHref = `/dang-nhap?next=${encodeURIComponent(returnTo)}`;
  const registerHref = `/dang-ky?next=${encodeURIComponent(returnTo)}`;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[95] flex items-center justify-center bg-brand-ink-dark/55 p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[400px] rounded-[20px] bg-white p-7 text-center shadow-[0_24px_60px_rgba(0,0,0,.28)]"
      >
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="cursor-pointer text-stone" aria-label="Đóng">
            <XIcon size={20} />
          </button>
        </div>
        <div className="mx-auto -mt-2 flex h-12 w-12 items-center justify-center rounded-full bg-cream-card text-brand-ink">
          <LockKeyIcon size={22} weight="fill" />
        </div>
        <div className="mt-4 font-[family-name:var(--font-lora)] text-xl font-bold text-brand-ink">{title}</div>
        <div className="mt-2 text-[13.5px] leading-[1.6] text-stone-dark">{description}</div>

        <div className="mt-6 flex flex-col gap-2.5">
          <Link
            href={loginHref}
            className="cursor-pointer rounded-full bg-brand-gold py-3 text-center text-sm font-bold text-brand-ink no-underline"
          >
            {primaryLabel}
          </Link>
          <Link
            href={registerHref}
            className="cursor-pointer rounded-full border border-cream py-3 text-center text-sm font-medium text-stone-dark no-underline"
          >
            Tạo tài khoản mới
          </Link>
        </div>
      </div>
    </div>
  );
}
