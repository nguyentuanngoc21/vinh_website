"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EyeIcon, EyeSlashIcon, ArrowRightIcon, WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { useRole } from "@/lib/role";
import { createClient } from "@/lib/supabase/client";
import { Field, Button, Alert } from "@/components/ui";
import { passwordScore, PASSWORD_SCORE_COLORS, PASSWORD_SCORE_LABELS } from "@/lib/password-strength";

type SessionCheck = "checking" | "valid" | "invalid";

export function ResetPasswordForm() {
  const router = useRouter();
  const { resetPassword } = useRole();

  // /api/auth/confirm already exchanged the emailed code for a recovery
  // session server-side (httpOnly sb-* cookies) before redirecting here —
  // this just confirms, client-side, that it actually landed before
  // showing a form that would otherwise fail at submit time with a
  // confusing error. Landing on this page without going through that
  // redirect (bookmarked, back button after the link already expired,
  // link reused a second time) means there's no session to check against.
  const [sessionCheck, setSessionCheck] = useState<SessionCheck>("checking");

  useEffect(() => {
    let cancelled = false;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!cancelled) setSessionCheck(data.user ? "valid" : "invalid");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const score = passwordScore(pw);
  const match = pw2.length > 0 && pw === pw2;
  const ready = pw.length >= 8 && match && !pending;

  const pw2Status =
    pw2.length === 0
      ? undefined
      : match
        ? ({ tone: "success", message: "Mật khẩu khớp" } as const)
        : ({ tone: "error", message: "Hai mật khẩu chưa khớp" } as const);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setPending(true);
    setError(null);
    const result = await resetPassword(pw);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push("/");
  };

  if (sessionCheck === "checking") {
    return (
      <div className="mx-auto w-full max-w-[400px] text-[14.5px] text-stone">Đang kiểm tra liên kết…</div>
    );
  }

  if (sessionCheck === "invalid") {
    return (
      <div className="mx-auto w-full max-w-[400px]">
        <WarningCircleIcon weight="fill" size={40} color="#B02A37" />
        <div className="mt-4 text-[24px] font-bold tracking-[-0.4px] text-brand-ink">
          Liên kết không hợp lệ
        </div>
        <div className="mt-2 text-[14.5px] leading-[1.6] text-stone">
          Liên kết đặt lại mật khẩu đã hết hạn hoặc đã được dùng trước đó. Vui lòng yêu cầu gửi
          lại email đặt lại mật khẩu.
        </div>
        <Link
          href="/quen-mat-khau"
          className="mt-6 flex items-center justify-center gap-[9px] rounded-[10px] bg-brand-gold py-[13px] text-[14.5px] font-bold text-brand-ink no-underline transition-transform active:scale-[.99]"
        >
          Gửi lại liên kết <ArrowRightIcon size={16} />
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto w-full max-w-[400px]">
      <div className="text-[30px] font-bold tracking-[-0.6px] text-brand-ink">Đặt lại mật khẩu</div>
      <div className="mt-2 text-[14.5px] text-stone">Chọn một mật khẩu mới cho tài khoản của bạn.</div>

      <div className="mt-[30px] flex flex-col gap-3.5">
        <div>
          <Field
            label="Mật khẩu mới"
            type={showPw ? "text" : "password"}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            suffix={
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                className="cursor-pointer text-stone-light"
              >
                {showPw ? <EyeSlashIcon size={19} /> : <EyeIcon size={19} />}
              </button>
            }
          />
          <div className="mt-2 flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                style={{ background: i < score ? PASSWORD_SCORE_COLORS[score] : "#efedea" }}
                className="h-1 flex-1 rounded-full transition-colors"
              />
            ))}
          </div>
          <div
            style={{ color: score >= 3 ? "#2F7A4F" : "var(--color-stone-light)" }}
            className="mt-1.5 text-xs"
          >
            {PASSWORD_SCORE_LABELS[score] || "Ít nhất 8 ký tự"}
          </div>
        </div>

        <Field
          label="Xác thực mật khẩu mới"
          type={showPw ? "text" : "password"}
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          placeholder="••••••••"
          autoComplete="new-password"
          status={pw2Status}
        />
      </div>

      {error && (
        <div className="mt-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <div className="mt-[22px]">
        <Button type="submit" disabled={!ready}>
          {pending ? (
            "Đang lưu…"
          ) : (
            <>
              Đặt lại mật khẩu <ArrowRightIcon size={16} />
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
