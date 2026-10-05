"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type RadioOption<T extends string> = {
  value: T;
  label: ReactNode;
  /** Dòng giải thích nhỏ dưới nhãn (tuỳ chọn). */
  description?: ReactNode;
  disabled?: boolean;
};

/**
 * Nhóm lựa chọn 1-trong-N. Dùng <input type="radio"> gốc (ẩn, sr-only) để
 * giữ đúng hành vi bàn phím (mũi tên chuyển lựa chọn, Tab vào/ra nhóm) và
 * đọc màn hình; chỉ vẽ lại vòng tròn cho đồng bộ với Checkbox.
 *
 * `label` của nhóm (câu hỏi) hiện như tiêu đề Field; truyền `null` nếu đã có
 * tiêu đề riêng bên ngoài — khi đó nên truyền `aria-label`.
 */
export function RadioGroup<T extends string>({
  label,
  value,
  onChange,
  options,
  name,
  disabled = false,
  className,
  "aria-label": ariaLabel,
}: {
  label: ReactNode | null;
  value: T | null;
  onChange: (value: T) => void;
  options: RadioOption<T>[];
  /** Mặc định tự sinh — chỉ cần truyền khi nhóm nằm trong <form> gửi thật. */
  name?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const autoName = useId();
  const groupName = name ?? autoName;
  const labelId = `${autoName}-label`;

  return (
    <div
      role="radiogroup"
      aria-labelledby={label !== null ? labelId : undefined}
      aria-label={label === null ? ariaLabel : undefined}
      className={className}
    >
      {label !== null && (
        <div id={labelId} className="mb-[7px] text-[13px] font-semibold text-slate">
          {label}
        </div>
      )}
      <div className="flex flex-col gap-2">
        {options.map((opt) => {
          const checked = opt.value === value;
          const isDisabled = disabled || opt.disabled;
          return (
            <label
              key={opt.value}
              className={cn(
                "flex cursor-pointer items-start gap-2.5",
                isDisabled && "cursor-not-allowed opacity-60"
              )}
            >
              <input
                type="radio"
                name={groupName}
                value={opt.value}
                checked={checked}
                disabled={isDisabled}
                onChange={() => onChange(opt.value)}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full border bg-surface transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand-gold",
                  checked ? "border-brand-ink" : "border-border-light"
                )}
              >
                <span
                  className={cn(
                    "h-[9px] w-[9px] rounded-full bg-brand-navy transition-opacity",
                    checked ? "opacity-100" : "opacity-0"
                  )}
                />
              </span>
              <span className="text-[13px] leading-[1.6] text-slate">
                {opt.label}
                {opt.description && <span className="block text-xs text-stone">{opt.description}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
