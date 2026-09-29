"use client";

import { forwardRef, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Multi-line sibling of `Field` (see field.tsx) — same label/hint/status
 * API, wraps a <textarea> instead of an <input>. Pulled out for the bio
 * field in edit-profile-tab.tsx and the message composer in chat-tab.tsx,
 * both of which previously hand-rolled their own <textarea> markup.
 */
type TextareaStatus = { tone: "success" | "error"; message: string };

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  /** Pass `null` to omit the label entirely. */
  label: ReactNode | null;
  hint?: ReactNode;
  status?: TextareaStatus;
  /** className applies to the <textarea> itself; use this for the wrapping
   * <label> (e.g. `flex-1` in a flex row) — see Field's wrapperClassName. */
  wrapperClassName?: string;
  /** "sm" = bản gọn (bảng admin, thẻ đơn hàng, hàng giá…). Dùng prop này
   * thay vì ghi đè padding/cỡ chữ qua `className` — thứ tự CSS Tailwind v4
   * sinh ra không theo thứ tự class, override có thể không thắng (xem
   * button.tsx). */
  size?: "md" | "sm";
};

const SIZE_CLASS = {
  md: "rounded-[10px] px-[15px] py-3 text-[14.5px]",
  sm: "rounded-lg px-3 py-2 text-[13px]",
} as const;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, status, className = "", wrapperClassName = "", size = "md", rows = 4, ...textareaProps },
  ref
) {
  const toneClass =
    status?.tone === "error"
      ? "border-error"
      : status?.tone === "success"
        ? "border-success-form"
        : "border-border-light";

  return (
    <label className={cn("block", wrapperClassName)}>
      {label !== null && (
        <div className="mb-[7px] text-[13px] font-semibold text-slate">{label}</div>
      )}
      <textarea
        ref={ref}
        rows={rows}
        className={cn(
          "w-full resize-y border text-ink focus:border-brand-ink focus:outline-none",
          toneClass,
          SIZE_CLASS[size],
          className
        )}
        {...textareaProps}
      />
      {(status || hint) && (
        <div
          className={`mt-1.5 text-xs ${
            status?.tone === "error"
              ? "text-error"
              : status?.tone === "success"
                ? "text-success-form"
                : "text-stone-light"
          }`}
        >
          {status ? status.message : hint}
        </div>
      )}
    </label>
  );
});
