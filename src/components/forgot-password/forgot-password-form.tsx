"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRightIcon, ArrowLeftIcon, CheckCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { requestPasswordReset, verifyRecoveryOtp } from "@/lib/auth";
import { Field, Button, Alert } from "@/components/ui";

export function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  // Set by /api/auth/confirm when the emailed link's code was missing,
  // already used, or expired — Supabase reset links are one-time and
  // short-lived, so this is the expected path once a link goes stale.
  const linkExpired = searchParams.get("error") === "link-het-han";

  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Mã 6 số trong cùng email đặt lại mật khẩu — thay thế cho việc bấm link
  // khi link mở sai browser (xem /api/auth/verify-otp cho lý do đầy đủ).
  const [otp, setOtp] = useState("");
  const [otpPending, setOtpPending] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState<string | null>(null);

  const ready = email.trim().length > 0;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || pending) return;
    setPending(true);
    setError(null);
    const result = await requestPasswordReset(email.trim());
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSent(true);
  };

  // Thành công ở đây chỉ dựng session phục hồi (cookie) — /dat-lai-mat-khau
  // là nơi thật sự đổi mật khẩu, đúng như khi đến từ link email.
  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (otp.trim().length === 0 || otpPending) return;
    setOtpPending(true);
    setOtpError(null);
    const result = await verifyRecoveryOtp(email.trim(), otp.trim());
    setOtpPending(false);
    if (!result.ok) {
      setOtpError(result.error);
      return;
    }
    router.push("/dat-lai-mat-khau");
  };

  const handleResend = async () => {
    if (resending) return;
    setResending(true);
    setResendMsg(null);
    await requestPasswordReset(email.trim());
    setResending(false);
    setResendMsg("Đã gửi lại email.");
  };

  if (sent) {
    return (
      <div className="mx-auto w-full max-w-[400px]">
        <CheckCircleIcon weight="fill" size={40} color="#2F7A4F" />
        <div className="mt-4 text-[24px] font-bold tracking-[-0.4px] text-brand-ink">
          Kiểm tra email của bạn
        </div>
        <div className="mt-2 text-[14.5px] leading-[1.6] text-stone">
          Nếu <span className="font-medium text-slate">{email.trim()}</span> tồn tại trong hệ
          thống, chúng tôi đã gửi một email chứa liên kết đặt lại mật khẩu. Liên kết có hiệu lực
          trong thời gian ngắn — hoặc nhập mã 6 số cũng có trong email vào ô dưới đây.
        </div>

        <form onSubmit={handleVerifyOtp} className="mt-5">
          <Field
            label="Mã xác nhận (6 số)"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            className="text-center text-[18px] tracking-[6px]"
          />
          {otpError && (
            <div className="mt-3">
              <Alert tone="error">{otpError}</Alert>
            </div>
          )}
          <div className="mt-3">
            <Button type="submit" disabled={otp.trim().length === 0 || otpPending}>
              {otpPending ? "Đang xác nhận…" : "Xác nhận mã"}
            </Button>
          </div>
        </form>

        <button
          type="button"
          onClick={handleResend}
          disabled={resending}
          className="mt-3 cursor-pointer text-[13px] font-medium text-brand-gold-dark hover:text-brand-gold disabled:cursor-default disabled:opacity-60"
        >
          {resending ? "Đang gửi lại…" : "Không thấy email? Gửi lại"}
        </button>
        {resendMsg && <div className="mt-1.5 text-[12.5px] text-stone-light">{resendMsg}</div>}

        <Link
          href="/dang-nhap"
          className="mt-6 flex items-center justify-center gap-[9px] rounded-[10px] border border-brand-ink py-[13px] text-[14.5px] font-semibold text-brand-ink no-underline transition-transform active:scale-[.99]"
        >
          <ArrowLeftIcon size={16} /> Quay lại đăng nhập
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto w-full max-w-[400px]">
      <Link
        href="/dang-nhap"
        className="mb-5 flex items-center gap-1.5 text-[13px] font-medium text-stone hover:text-brand-ink"
      >
        <ArrowLeftIcon size={14} /> Quay lại đăng nhập
      </Link>

      <div className="text-[30px] font-bold tracking-[-0.6px] text-brand-ink">Quên mật khẩu?</div>
      <div className="mt-2 text-[14.5px] leading-[1.5] text-stone">
        Nhập email đã dùng để đăng ký, chúng tôi sẽ gửi liên kết để bạn đặt lại mật khẩu.
      </div>

      <div className="mt-[30px]">
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ban@email.com"
          autoComplete="username"
        />
      </div>

      {linkExpired && !error && (
        <div className="mt-4">
          <Alert tone="error">
            Liên kết đặt lại mật khẩu đã hết hạn hoặc không hợp lệ. Vui lòng yêu cầu gửi lại bên
            dưới.
          </Alert>
        </div>
      )}

      {error && (
        <div className="mt-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <div className="mt-[22px]">
        <Button type="submit" disabled={!ready || pending}>
          {pending ? (
            "Đang gửi…"
          ) : (
            <>
              Gửi liên kết đặt lại <ArrowRightIcon size={16} />
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
