"use client";

import type { CSSProperties } from "react";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react/dist/ssr";

/** Nút "Trước / Trang X/Y / Sau" dưới danh sách bình luận — dùng chung cho
 * section "Bình luận chương" (màu theo theme trang đọc, truyền qua style) và
 * panel "Chú thích đoạn văn" (màu mặc định). Ẩn khi chỉ có 1 trang. */
export function CommentPagination({
  page,
  totalPages,
  disabled,
  onChange,
  buttonStyle,
  labelStyle,
}: {
  page: number;
  totalPages: number;
  disabled?: boolean;
  onChange: (page: number) => void;
  buttonStyle?: CSSProperties;
  labelStyle?: CSSProperties;
}) {
  if (totalPages <= 1) return null;
  const buttonClass =
    "flex min-h-10 cursor-pointer items-center gap-1 rounded-full border border-border-light px-4 text-[13px] font-semibold text-ink transition-colors hover:border-brand-ink disabled:cursor-default disabled:opacity-45";
  return (
    <nav aria-label="Phân trang bình luận" className="flex items-center justify-center gap-2">
      <button
        type="button"
        disabled={disabled || page <= 1}
        onClick={() => onChange(page - 1)}
        style={buttonStyle}
        className={buttonClass}
      >
        <CaretLeftIcon size={14} /> Trước
      </button>
      <span style={labelStyle} className="min-w-[72px] text-center text-[13px] font-medium text-stone-alt">
        Trang {page}/{totalPages}
      </span>
      <button
        type="button"
        disabled={disabled || page >= totalPages}
        onClick={() => onChange(page + 1)}
        style={buttonStyle}
        className={buttonClass}
      >
        Sau <CaretRightIcon size={14} />
      </button>
    </nav>
  );
}
