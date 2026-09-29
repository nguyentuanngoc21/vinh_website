import { type ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "error" | "info" | "success";

const TONE_CLASS: Record<Tone, string> = {
  error: "border-error-border bg-error-bg text-error",
  info: "border-cream-border bg-cream-card text-stone-dark",
  success: "border-success-form-border bg-success-form-bg text-success-form",
};

/**
 * Inline banner for form errors and notices. Replaces the one-off
 *   rounded-[10px] border border-error-border bg-error-bg ... text-error
 * block duplicated in login-form, register-form, and the profile tabs.
 *
 * `icon` is optional — pass a Phosphor icon element for banners that need
 * one (e.g. the eligibility banner in edit-profile-tab.tsx); omit it for a
 * plain text banner.
 */
export function Alert({
  tone = "error",
  icon,
  className = "",
  children,
}: {
  tone?: Tone;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const base = cn("rounded-[10px] border px-4 py-3 text-[13px] leading-[1.5]", TONE_CLASS[tone], className);
  if (!icon) {
    return <div className={base}>{children}</div>;
  }
  return (
    <div className={cn("flex items-center gap-2.5 font-medium", base)}>
      {icon}
      <div>{children}</div>
    </div>
  );
}
