import { CheckCircleIcon, WarningCircleIcon, XCircleIcon } from "@phosphor-icons/react/dist/ssr";
import type { EligibilityCheck } from "@/lib/contests/eligibility/types";

/**
 * EligibilityCheck — mọi tiêu chí kèm số liệu thật (vd "vượt 13.240 chữ"),
 * không chỉ đánh dấu đạt / trượt (đặc tả UX mục 8, "Truyện không đủ điều kiện").
 */
export function EligibilityChecklist({ checks }: { checks: EligibilityCheck[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {checks.map((c) => (
        <li key={c.code} className="flex items-start gap-2.5 text-[13.5px] leading-snug">
          {c.passed ? (
            <CheckCircleIcon size={18} weight="fill" className="mt-px shrink-0 text-success-form" />
          ) : c.blocking ? (
            <XCircleIcon size={18} weight="fill" className="mt-px shrink-0 text-error" />
          ) : (
            <WarningCircleIcon size={18} weight="fill" className="mt-px shrink-0 text-brand-gold-dark" />
          )}
          <span className={c.passed ? "text-ink" : "text-ink"}>{c.message}</span>
        </li>
      ))}
    </ul>
  );
}
