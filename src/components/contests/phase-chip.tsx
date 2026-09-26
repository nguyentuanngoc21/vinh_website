import { CircleIcon } from "@phosphor-icons/react/dist/ssr";
import type { PhaseTone } from "@/lib/contests/phase-copy";

/** PhaseChip — 3 tông: nóng (gold), trung tính, đã xong (cream). `dark` = đặt trên nền navy. */
export function PhaseChip({ label, tone, dark = false }: { label: string; tone: PhaseTone; dark?: boolean }) {
  const toneClass =
    tone === "hot"
      ? "bg-brand-gold-light text-brand-ink"
      : tone === "done"
        ? dark ? "bg-white/15 text-white" : "bg-cream-gold text-brand-gold-dark"
        : dark ? "border border-white/20 bg-white/10 text-hero-text" : "bg-info-bg text-brand-ink";
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 self-start whitespace-nowrap rounded-full px-3 py-[5px] text-xs font-semibold tracking-[.3px] ${toneClass}`}>
      <CircleIcon size={8} weight="fill" /> {label}
    </span>
  );
}
