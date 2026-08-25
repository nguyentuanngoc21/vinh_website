import { XIcon } from "@phosphor-icons/react/dist/ssr";
import { type ReactNode } from "react";

type PillProps = {
  children: ReactNode;
  /** Có mặt = hiện nút "x" để gỡ (dùng cho tag-input phía tác giả). Vắng
   * mặt = chỉ hiển thị, dùng cho tag pill ở trang giới thiệu truyện. */
  onRemove?: () => void;
  className?: string;
};

/**
 * Chip hiển thị 1 tag/nhãn — cùng tông màu với GenreSelect
 * (bg-neutral-bg/text-ink) nhưng không phải lựa chọn (không active state),
 * vì đây là hiển thị NHIỀU giá trị cùng lúc chứ không phải chọn 1 trong N.
 */
export function Pill({ children, onRemove, className }: PillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-neutral-bg px-[13px] py-1.5 text-[13px] font-medium text-ink ${className ?? ""}`}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Xoá"
          className="cursor-pointer text-stone-alt transition-colors hover:text-brand-ink"
        >
          <XIcon size={12} weight="bold" />
        </button>
      )}
    </span>
  );
}
