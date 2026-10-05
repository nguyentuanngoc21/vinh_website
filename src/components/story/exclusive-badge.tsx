import { SealCheckIcon } from "@phosphor-icons/react/dist/ssr";

type ExclusiveBadgeVariant = "chip" | "pill" | "overlay";

const PILL =
  "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-brand-navy/90 px-2 py-[3px] text-[10.5px] font-semibold leading-none text-white";

/**
 * Tag "Độc quyền" cho truyện có books.is_exclusive = true — truyện chỉ phát
 * hành trên Vịnh.
 *   - chip: cạnh tiêu đề ở trang giới thiệu truyện.
 *   - pill: nhãn nhỏ đứng trong dòng (danh sách có bìa thu nhỏ, hàng nhãn trên bìa).
 *   - overlay: pill đặt góc trên-trái bìa — khung bìa cha phải là `relative`.
 */
export function ExclusiveBadge({ variant = "chip" }: { variant?: ExclusiveBadgeVariant }) {
  if (variant === "chip") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-navy px-3 py-1 text-[12.5px] font-semibold text-white">
        <SealCheckIcon size={14} weight="fill" className="text-brand-gold-light" />
        Độc quyền tại Vịnh
      </span>
    );
  }
  return (
    <span
      className={`${PILL} ${variant === "overlay" ? "pointer-events-none absolute left-1.5 top-1.5 shadow-sm" : ""}`}
    >
      <SealCheckIcon size={11} weight="fill" className="text-brand-gold-light" />
      Độc quyền
    </span>
  );
}
