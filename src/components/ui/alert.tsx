import { type ReactNode } from "react";

type Tone = "error" | "info" | "success";

const TONE_CLASS: Record<Tone, string> = {
  error: "border-[#f3c6c6] bg-[#FBEDEC] text-[#B02A37]",
  info: "border-cream-border bg-cream-card text-stone-dark",
  success: "border-[#DBF3E8] bg-[#F4FAF6] text-[#2F7A4F]",
};

/**
 * Inline banner for form errors and notices. Replaces the one-off
 *   rounded-[10px] border border-[#f3c6c6] bg-[#FBEDEC] ... text-[#B02A37]
 * block duplicated in login-form, register-form, and the profile tabs.
 */
export function Alert({ tone = "error", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div className={`rounded-[10px] border px-4 py-3 text-[13px] leading-[1.5] ${TONE_CLASS[tone]}`}>
      {children}
    </div>
  );
}
