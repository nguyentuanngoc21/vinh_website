import { type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "dark" | "ghost" | "danger" | "danger-outline";

const VARIANT_CLASS: Record<Variant, string> = {
  // Gold CTA — the "submit / continue" action across auth and author flows.
  primary: "bg-brand-gold text-brand-ink hover:brightness-[1.08]",
  // Solid ink — used for secondary confirms (e.g. admin panel actions).
  dark: "bg-brand-ink text-white hover:bg-brand-ink-dark",
  // Text-only, for tertiary/cancel actions.
  ghost: "bg-transparent text-brand-ink border border-border-light hover:bg-cream-card",
  // Hành động phá huỷ/không hoàn tác (gỡ chương, xoá, mở tranh chấp).
  danger: "bg-error text-white hover:brightness-[0.95]",
  // Bản nhẹ của danger — nút phụ cạnh hành động chính (xoá, báo mất liên lạc).
  "danger-outline": "border border-error-border bg-white text-error hover:bg-error-bg",
};

const SIZE_CLASS = {
  md: "rounded-[10px] py-[14px] text-[15px]",
  // Nút gọn cho bảng, thẻ, panel bên (thay cho className="px-4 py-2 text-xs").
  sm: "rounded-lg px-4 py-2 text-[13px]",
} as const;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  /** Set to `false` for a button that should size to its content instead of
   * stretching full-width (e.g. an inline composer's send button). Passing
   * a width class via `className` alone does NOT reliably override the
   * base `w-full` — Tailwind's generated stylesheet order follows its own
   * internal ordering, not the order classes appear in the `className`
   * string, so `w-full` can still win. Use this prop instead. */
  fullWidth?: boolean;
  size?: keyof typeof SIZE_CLASS;
};

/**
 * Shared button. Every screen previously re-typed
 *   "flex w-full items-center justify-center gap-[9px] rounded-[10px] py-[14px]
 *    text-[15px] font-bold transition-transform active:scale-[.99] disabled:cursor-not-allowed"
 * by hand — this centralizes it. Pass `disabled` for the built-in dimmed
 * state instead of a manual `style={{ opacity }}`.
 */
export function Button({
  variant = "primary",
  fullWidth = true,
  size = "md",
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={cn(
        "flex cursor-pointer items-center justify-center gap-[9px] font-bold transition-transform active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-55",
        SIZE_CLASS[size],
        fullWidth ? "w-full" : "w-auto",
        VARIANT_CLASS[variant],
        className
      )}
      {...props}
    />
  );
}
