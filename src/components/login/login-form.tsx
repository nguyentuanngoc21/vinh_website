"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { EyeIcon, EyeSlashIcon, ArrowRightIcon, UserPlusIcon } from "@phosphor-icons/react/dist/ssr";
import { useRole } from "@/lib/role";
import { Field, Button, Alert, Checkbox } from "@/components/ui";
import { LegalLink } from "@/components/legal/legal-link";
import { resolveRedirectTarget } from "@/lib/redirect-target";
import { usePendingNavigate } from "@/lib/navigation/pending-navigation";
import { useAsyncSubmit } from "@/lib/hooks/use-async-submit";

type LoginFormProps = {
  /** Trang cần quay lại sau khi đăng nhập xong (đọc ?next= ở page.tsx, đã
   * là Server Component nên không cần useSearchParams() ở đây). Validate
   * qua resolveRedirectTarget() (src/lib/redirect-target.ts) — sai định
   * dạng thì rơi về "/" như trước. */
  nextPath?: string;
};

export function LoginForm({ nextPath }: LoginFormProps = {}) {
  const navigate = usePendingNavigate();
  const { login } = useRole();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const { pending, error, run } = useAsyncSubmit(login);

  const ready = identifier.trim().length > 0 && password.length > 0;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || pending) return;
    const result = await run(identifier.trim(), password, remember);
    if (result.ok) navigate(resolveRedirectTarget(nextPath));
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto w-full max-w-[400px]">
      <div className="text-[30px] font-bold tracking-[-0.6px] text-brand-ink">Đăng nhập</div>
      <div className="mt-2 text-[14.5px] text-stone">
        Chưa có tài khoản?{" "}
        <Link href="/dang-ky" className="font-medium text-brand-gold-dark hover:text-brand-gold">
          Đăng ký miễn phí
        </Link>
      </div>

      <div className="mt-[30px] flex flex-col gap-3.5">
        <Field
          label="Email hoặc tên tài khoản"
          type="text"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="ban@email.com hoặc tên tài khoản"
          autoComplete="username"
        />

        <div>
          <div className="mb-[7px] flex items-center justify-between">
            <span className="text-[13px] font-semibold text-slate">Mật khẩu</span>
            <Link
              href="/quen-mat-khau"
              className="text-[12.5px] font-medium text-brand-gold-dark hover:text-brand-gold"
            >
              Quên mật khẩu?
            </Link>
          </div>
          <Field
            label={null}
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            suffix={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                className="cursor-pointer text-stone-light"
              >
                {showPassword ? <EyeSlashIcon size={19} /> : <EyeIcon size={19} />}
              </button>
            }
          />
        </div>
      </div>

      <div className="mt-4">
        <Checkbox checked={remember} onChange={() => setRemember((v) => !v)}>
          Ghi nhớ đăng nhập
        </Checkbox>
      </div>

      {error && (
        <div className="mt-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <div className="mt-[22px]">
        <Button type="submit" disabled={!ready || pending}>
          {pending ? (
            "Đang đăng nhập…"
          ) : (
            <>
              Đăng nhập <ArrowRightIcon size={16} />
            </>
          )}
        </Button>
      </div>

      <div className="my-6 flex items-center gap-3.5">
        <div className="h-px flex-1 bg-cream" />
        <div className="text-[12.5px] font-medium text-stone-light">hoặc</div>
        <div className="h-px flex-1 bg-cream" />
      </div>

      <Link
        href="/dang-ky"
        className="flex items-center justify-center gap-[9px] rounded-[10px] border border-brand-ink py-[13px] text-[14.5px] font-semibold text-brand-ink no-underline transition-transform active:scale-[.99]"
      >
        <UserPlusIcon size={18} /> Tạo tài khoản mới
      </Link>

      <div className="mt-6 text-[12.5px] leading-[1.6] text-stone-light">
        Khi đăng nhập, bạn đồng ý với{" "}
        <LegalLink doc="terms" className="text-brand-gold-dark">Điều khoản sử dụng</LegalLink> và{" "}
        <LegalLink doc="privacy" className="text-brand-gold-dark">Chính sách bảo mật</LegalLink> của Vịnh.
      </div>
    </form>
  );
}
