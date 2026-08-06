import { type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "dark" | "ghost";

const VARIANT_CLASS: Record<Variant, string> = {
  // Gold CTA — the "submit / continue" action across auth and author flows.
  primary: "bg-brand-gold text-brand-ink",
  // Solid ink — used for secondary confirms (e.g. admin panel actions).
  dark: "bg-brand-ink text-white",
  // Text-only, for tertiary/cancel actions.
  ghost: "bg-transparent text-brand-ink border border-border-light",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

/**
 * Shared button. Every screen previously re-typed
 *   "flex w-full items-center justify-center gap-[9px] rounded-[10px] py-[14px]
 *    text-[15px] font-bold transition-transform active:scale-[.99] disabled:cursor-not-allowed"
 * by hand — this centralizes it. Pass `disabled` for the built-in dimmed
 * state instead of a manual `style={{ opacity }}`.
 */
export function Button({ variant = "primary", className = "", disabled, ...props }: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={`flex w-full cursor-pointer items-center justify-center gap-[9px] rounded-[10px] py-[14px] text-[15px] font-bold transition-transform active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-55 ${VARIANT_CLASS[variant]} ${className}`}
      {...props}
    />
  );
}
