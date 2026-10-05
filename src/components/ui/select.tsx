"use client";

import { forwardRef, type ReactNode, type SelectHTMLAttributes } from "react";
import { CaretDownIcon } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/cn";

/**
 * Dropdown sibling of `Field`/`Textarea` — same label/hint/status API, wraps
 * a native <select> (giữ bàn phím/đọc màn hình/bộ chọn gốc trên điện thoại).
 * Trước đây mỗi form (design upload, admin dispute/moderation, contest
 * panels, order card…) tự viết class cho <select> riêng.
 *
 * Truyền <option> qua `children` như <select> thường.
 */
type SelectStatus = { tone: "success" | "error"; message: string };

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & {
  /** Pass `null` to omit the label entirely. */
  label: ReactNode | null;
  hint?: ReactNode;
  status?: SelectStatus;
  /** className applies to the <select> itself; use this for the wrapping
   * <label> — see Field's wrapperClassName. */
  wrapperClassName?: string;
  /** "sm" = bản gọn (bảng admin, thẻ đơn hàng, hàng giá…). Dùng prop này
   * thay vì ghi đè padding/cỡ chữ qua `className` — thứ tự CSS Tailwind v4
   * sinh ra không theo thứ tự class, override có thể không thắng (xem
   * button.tsx). */
  size?: "md" | "sm";
  children: ReactNode;
};

const SIZE_CLASS = {
  md: "rounded-[10px] py-3 pl-[15px] text-[14.5px]",
  sm: "rounded-lg py-2 pl-3 text-[13px]",
} as const;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, status, className = "", wrapperClassName = "", size = "md", children, ...selectProps },
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
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            "w-full appearance-none border bg-surface pr-10 text-ink focus:border-brand-ink focus:outline-none disabled:cursor-not-allowed disabled:opacity-60",
            toneClass,
            SIZE_CLASS[size],
            className
          )}
          {...selectProps}
        >
          {children}
        </select>
        <CaretDownIcon
          size={16}
          aria-hidden
          className="pointer-events-none absolute right-[13px] top-1/2 -translate-y-1/2 text-stone"
        />
      </div>
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
