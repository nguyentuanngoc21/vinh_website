import Link from "next/link";
import { ContestKeyVisual } from "@/components/contests/contest-key-visual";
import { PhaseChip } from "@/components/contests/phase-chip";
import type { ContestSummary } from "@/lib/contests/contest-service";
import { countdownFor, formatRemaining, PHASE_COPY } from "@/lib/contests/phase-copy";
import { formatVnDateTime } from "@/lib/contests/datetime";

/** ContestCard — thẻ "Các cuộc thi đang diễn ra" trên hub. */
export function ContestCard({ contest, now }: { contest: ContestSummary; now: number }) {
  const phase = PHASE_COPY[contest.status];
  const cd = countdownFor(contest);
  const cdText = cd
    ? cd.mode === "date"
      ? `${cd.label.charAt(0).toUpperCase()}${cd.label.slice(1)} ${formatVnDateTime(cd.target).split(" ").pop()}`
      : `${cd.label.charAt(0).toUpperCase()}${cd.label.slice(1)} ${formatRemaining(Date.parse(cd.target) - now)}`
    : phase.label;

  return (
    <Link href={`/cuoc-thi/${contest.slug}`}
      className="flex flex-col overflow-hidden rounded-2xl border border-border-light bg-white no-underline transition-colors hover:border-brand-gold">
      <ContestKeyVisual url={contest.key_visual_url} title={contest.title} className="h-[120px] p-3">
        <div className="relative"><PhaseChip label={phase.label} tone={phase.tone} dark /></div>
      </ContestKeyVisual>
      <div className="flex flex-1 flex-col gap-2 px-4 pb-4 pt-3.5">
        <div className="text-base font-bold text-ink">{contest.title}</div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-stone-alt">
          <span>{contest.entry_count} bài</span>
          <span>{cdText}</span>
        </div>
        <div className="mt-auto pt-1.5 text-[13.5px] font-semibold text-brand-gold-dark">{phase.primary.label} →</div>
      </div>
    </Link>
  );
}
