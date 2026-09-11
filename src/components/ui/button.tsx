import { type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "dark" | "ghost";

const VARIANT_CLASS: Record<Variant, string> = {
  // Gold CTA — the "submit / continue" action across auth and author flows.
  primary: "bg-brand-gold text-brand-ink hover:brightness-[1.08]",
  // Solid ink — used for secondary confirms (e.g. admin panel actions).
  dark: "bg-brand-ink text-white hover:bg-brand-ink-dark",
  // Text-only, for tertiary/cancel actions.
  ghost: "bg-transparent text-brand-ink border border-border-light hover:bg-cream-card",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  /** Set to `false` for a button that should size to its content instead of
   * stretching full-width (e.g. an inline composer's send button). Passing
   * a width class via `className` alone does NOT reliably override the
   * base `w-full` — Tailwind's generated stylesheet order follows its own
   * internal ordering, not the order classes appear in the `className`
   * string, so `w-full` can still win. Use this prop instead. */
  fullWidth?: boolean;
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
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={`flex ${fullWidth ? "w-full" : "w-auto"} cursor-pointer items-center justify-center gap-[9px] rounded-[10px] py-[14px] text-[15px] font-bold transition-transform active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-55 ${VARIANT_CLASS[variant]} ${className}`}
      {...props}
    />
  );
}
