"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LockKeyIcon, WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { Modal } from "@/components/ui";
import { AGE_RATING_LABELS, contentWarningLabel, type AgeRating } from "@/lib/age-rating";
import type { AgeGate } from "@/lib/age-rating-access";
import { useCanReadAdult } from "@/lib/use-can-read-adult";

/** Huy hiệu "16+"/"18+" — không hiện gì với truyện mọi lứa tuổi. */
export function AgeRatingBadge({
  rating,
  className,
  overlay = false,
}: {
  rating: AgeRating;
  className?: string;
  /** Góc dưới-phải bìa (khung cha phải `relative`) — góc trên đã có ExclusiveBadge (trái), nhãn thể loại/con dấu bảo hộ (phải). */
  overlay?: boolean;
}) {
  if (rating === "all") return null;
  if (overlay) {
    return (
      <span
        className={`pointer-events-none absolute bottom-1.5 right-1.5 z-[1] inline-flex items-center rounded-full px-2 py-[3px] text-[10.5px] font-bold leading-none shadow-sm ${
          rating === "18" ? "bg-error text-white" : "bg-cream-gold text-brand-gold-dark"
        }`}
      >
        {AGE_RATING_LABELS[rating]}
      </span>
    );
  }
  return (
    <span
      title={rating === "18" ? "Truyện dành cho người đủ 18 tuổi" : "Truyện dành cho người đủ 16 tuổi"}
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[12px] font-bold ${
        rating === "18" ? "bg-error text-white" : "bg-cream-gold text-brand-gold-dark"
      } ${className ?? ""}`}
    >
      {AGE_RATING_LABELS[rating]}
    </span>
  );
}

/** Dòng "Cảnh báo: Bạo lực · Máu me…" dưới tiêu đề truyện. */
export function ContentWarningList({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="mt-2 flex items-start gap-1.5 text-[13px] text-stone-dark">
      <WarningCircleIcon size={15} className="mt-0.5 shrink-0 text-brand-gold-dark" />
      <span>
        <span className="font-semibold">Cảnh báo nội dung:</span> {warnings.map(contentWarningLabel).join(" · ")}
      </span>
    </div>
  );
}

const IDENTITY_HREF = "/ca-nhan?tab=edit#xac-thuc-cccd";

/**
 * Thông báo chặn truyện 18+ (trang truyện + trang đọc). Server đã KHÔNG gửi
 * nội dung chương khi tới đây — component này chỉ giải thích và dẫn tới bước
 * tiếp theo (đăng nhập / xác thực CCCD).
 */
export function Age18Notice({
  reason,
  nextPath,
}: {
  reason: Extract<AgeGate, { gate: "verify18" }>["reason"];
  nextPath: string;
}) {
  const body =
    reason === "guest"
      ? "Truyện này chỉ dành cho tài khoản đã xác thực đủ 18 tuổi qua CCCD. Vui lòng đăng nhập để tiếp tục."
      : reason === "unverified"
        ? "Truyện này chỉ dành cho tài khoản đã xác thực đủ 18 tuổi. Xác thực CCCD trong trang cá nhân để đọc."
        : "Năm sinh trên CCCD đã xác thực của bạn chưa đủ 18 tuổi. Nếu bạn vừa đủ 18 tuổi trong năm nay, hãy cập nhật đúng ngày sinh trong trang cá nhân.";
  const cta =
    reason === "guest"
      ? { href: `/dang-nhap?next=${encodeURIComponent(nextPath)}`, label: "Đăng nhập" }
      : reason === "unverified"
        ? { href: IDENTITY_HREF, label: "Xác thực CCCD" }
        : { href: "/ca-nhan?tab=edit", label: "Cập nhật ngày sinh" };

  return (
    <div className="rounded-[14px] border border-cream-border bg-cream-card px-5 py-6 text-center sm:px-8">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-error text-white">
        <LockKeyIcon size={22} weight="bold" />
      </div>
      <div className="text-[16px] font-bold text-brand-ink">Nội dung 18+</div>
      <p className="mx-auto mt-2 max-w-[440px] text-[14px] leading-[1.6] text-slate">{body}</p>
      <Link
        href={cta.href}
        className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-brand-navy px-6 text-[14px] font-semibold text-white no-underline transition-opacity hover:opacity-90"
      >
        {cta.label}
      </Link>
    </div>
  );
}

const CONFIRM16_KEY = "vinh:age16-confirmed";

function readConfirmed(): boolean {
  try {
    return window.localStorage.getItem(CONFIRM16_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Màn hình tự xác nhận cho truyện 16+. Chỉ là bước xác nhận ở giao diện (đã
 * chốt: 16+ không cần xác thực CCCD) — nhớ theo trình duyệt, hỏi 1 lần.
 * Mở sau khi mount (localStorage chỉ có ở client) để không lệch hydrate.
 */
export function Age16Confirm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Đọc localStorage chỉ có ở client — không thể tính sẵn lúc render server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!readConfirmed()) setOpen(true);
  }, []);

  const confirm = () => {
    try {
      window.localStorage.setItem(CONFIRM16_KEY, "1");
    } catch {
      // Storage bị chặn — vẫn cho đọc lần này, lần sau hỏi lại.
    }
    setOpen(false);
  };

  const leave = () => {
    if (window.history.length > 1) router.back();
    else router.push("/");
  };

  return (
    <Modal open={open} onClose={leave} closeOnBackdrop={false} panelClassName="max-w-[400px] p-6">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-cream-gold text-[15px] font-bold text-brand-gold-dark">
          16+
        </div>
        <h2 className="text-[17px] font-bold text-brand-ink">Truyện dành cho người đủ 16 tuổi</h2>
        <p className="mt-2 text-[14px] leading-[1.6] text-slate">
          Truyện có thể chứa bạo lực, kinh dị hoặc chủ đề nặng. Bạn xác nhận mình đủ 16 tuổi để tiếp tục?
        </p>
        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row-reverse">
          <button
            type="button"
            onClick={confirm}
            className="min-h-11 flex-1 cursor-pointer rounded-full bg-brand-navy px-5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            Tôi đủ 16 tuổi
          </button>
          <button
            type="button"
            onClick={leave}
            className="min-h-11 flex-1 cursor-pointer rounded-full border border-cream-border px-5 text-[14px] font-semibold text-brand-ink transition-colors hover:border-brand-ink"
          >
            Quay lại
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Bọc bìa truyện 18+ ở danh sách: làm mờ cho tới khi biết người xem đã xác
 * thực đủ 18 tuổi (useCanReadAdult). Chỉ là lớp hiển thị — bìa không phải
 * nội dung bị chặn, quyền đọc chương kiểm ở server.
 */
export function AdultCoverShield({ children }: { children: React.ReactNode }) {
  const canRead = useCanReadAdult();
  return (
    <div className="h-full w-full overflow-hidden">
      <div className={`h-full w-full transition-[filter] duration-300 ${canRead ? "" : "scale-110 blur-lg"}`}>{children}</div>
    </div>
  );
}
