import { StarIcon } from "@phosphor-icons/react/dist/ssr";
import type { ThemeColors } from "./reader";

type VoteButtonProps = {
  /** "compact" = icon+số trong header (theme-aware, cần `c`). "full" =
   * pill có nhãn trong hàng action dưới khung đọc (tông màu cố định,
   * giống pill toggle ở design-gallery.tsx — không đổi theo theme đọc). */
  variant: "compact" | "full";
  voted: boolean;
  voteCount: number;
  pending: boolean;
  onToggle: () => void;
  c?: ThemeColors;
};

/**
 * Thuần presentational — state thật (voted/voteCount) sống ở reader.tsx,
 * dùng chung giữa 2 vị trí (header + hàng action) nên cả 2 luôn đồng bộ.
 */
export function VoteButton({ variant, voted, voteCount, pending, onToggle, c }: VoteButtonProps) {
  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={onToggle}
        disabled={pending}
        aria-label="Bấm bình chọn nhanh"
        aria-pressed={voted}
        style={{ color: voted ? "var(--color-brand-gold-dark)" : c?.ink }}
        className="flex cursor-pointer items-center gap-1 transition-colors hover:text-brand-gold-dark disabled:cursor-default"
      >
        <StarIcon size={20} weight={voted ? "fill" : "regular"} />
        <span className="text-[13px] font-semibold">{voteCount}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      style={{
        background: voted ? "var(--color-brand-ink)" : "var(--color-brand-gold)",
        color: voted ? "#fff" : "var(--color-brand-ink)",
      }}
      className="flex cursor-pointer items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-colors disabled:cursor-default disabled:opacity-70"
    >
      <StarIcon weight="fill" /> {voted ? "Đã bình chọn" : "Bình chọn"} · {voteCount}
    </button>
  );
}
