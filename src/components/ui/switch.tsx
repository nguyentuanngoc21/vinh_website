import { type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Công tắc bật/tắt (role="switch"). Trước đây services-tab tự dựng track +
 * núm bằng style inline với màu hex riêng; dùng component này cho mọi toggle
 * "đang bật / đang tắt" thay vì Checkbox (Checkbox = đồng ý/chọn, Switch =
 * trạng thái có hiệu lực ngay).
 *
 * Có `label` thì chữ nằm bên phải và cả hàng bấm được; không có thì BẮT
 * BUỘC truyền `aria-label`.
 */
export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
  size = "md",
  title,
  className,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
  /** "sm" = track 36×20 (hàng danh sách dày), "md" = 44×24. */
  size?: "md" | "sm";
  title?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const track = size === "sm" ? "h-5 w-9" : "h-6 w-11";
  const knob = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const shift = size === "sm" ? "translate-x-4" : "translate-x-5";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label ? undefined : ariaLabel}
      title={title}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex cursor-pointer items-center gap-2.5 text-left disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
    >
      <span
        className={cn(
          "flex shrink-0 rounded-full p-0.5 transition-colors",
          track,
          checked ? "bg-brand-ink" : "bg-border-light"
        )}
      >
        <span
          className={cn(
            "rounded-full bg-white shadow-sm transition-transform",
            knob,
            checked ? shift : "translate-x-0"
          )}
        />
      </span>
      {label && <span className="text-[13px] leading-[1.5] text-slate">{label}</span>}
    </button>
  );
}
