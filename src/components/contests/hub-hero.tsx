"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import { ContestKeyVisual } from "@/components/contests/contest-key-visual";
import { Countdown } from "@/components/contests/countdown";
import { PhaseChip } from "@/components/contests/phase-chip";
import type { ContestSummary } from "@/lib/contests/contest-service";
import { formatVnDateTime } from "@/lib/contests/datetime";
import { countdownFor, PHASE_COPY, tabForAction } from "@/lib/contests/phase-copy";

/**
 * ContestHero của hub — 1 cuộc thi / slide, chấm chuyển slide. Mobile: key
 * visual lên trên (16:9), nội dung dưới, CTA full-width (đặc tả UX mục 6).
 */
export function HubHero({ contests }: { contests: ContestSummary[] }) {
  const [index, setIndex] = useState(0);
  const c = contests[Math.min(index, contests.length - 1)];
  if (!c) return null;
  const phase = PHASE_COPY[c.status];
  const cd = countdownFor(c);
  const ctaHref = (action: typeof phase.primary.action) => {
    if (action === "submit") return `/cuoc-thi/${c.slug}/gui-bai`;
    const tab = tabForAction(action, c.status);
    return tab ? `/cuoc-thi/${c.slug}?tab=${tab}` : `/cuoc-thi/${c.slug}`;
  };

  return (
    <div className="flex flex-col-reverse overflow-hidden rounded-[22px] bg-brand-ink text-white md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col gap-4 p-6 sm:p-9 lg:p-11">
        <div className="flex flex-wrap items-center gap-2.5">
          <PhaseChip label={phase.label} tone={phase.tone} dark />
          <span className="text-[13px] text-sidebar-text-dim-2">
            {formatVnDateTime(c.submission_start).split(" ").pop()} – {formatVnDateTime(c.result_at ?? c.submission_end).split(" ").pop()}
          </span>
        </div>
        <div>
          <h2 className="text-[30px] font-bold leading-[1.08] tracking-[-1px] sm:text-[44px]">{c.title}</h2>
          {c.short_description && <p className="mt-3 max-w-[480px] text-base leading-relaxed text-hero-text-dim">{c.short_description}</p>}
        </div>
        <div className="grid grid-cols-3 gap-4 sm:flex sm:gap-7">
          <div><div className="text-2xl font-bold">{c.entry_count}</div><div className="text-xs text-sidebar-text-dim-2">tác phẩm</div></div>
          <div><div className="text-2xl font-bold">{c.author_count}</div><div className="text-xs text-sidebar-text-dim-2">tác giả</div></div>
          {cd && (
            <Countdown data={cd} refreshAt={null} className="border-l border-white/20 pl-4 text-brand-gold-light sm:pl-7" labelClassName="text-sidebar-text-dim-2" />
          )}
        </div>
        <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Link href={ctaHref(phase.primary.action)}
            className="flex min-h-[46px] items-center justify-center rounded-full bg-brand-gold px-7 py-3 text-[15px] font-semibold text-brand-ink no-underline">
            {phase.primary.label}
          </Link>
          {phase.secondary && (
            <Link href={ctaHref(phase.secondary.action)}
              className="flex min-h-[46px] items-center justify-center rounded-full border border-white/30 px-6 py-3 text-[15px] font-semibold text-white no-underline">
              {phase.secondary.label}
            </Link>
          )}
          <Link href={`/cuoc-thi/${c.slug}`} className="flex items-center justify-center gap-1.5 px-1.5 py-3 text-[14.5px] font-medium text-hero-text no-underline">
            Trang cuộc thi <ArrowRightIcon size={15} weight="bold" />
          </Link>
        </div>
        {contests.length > 1 && (
          <div className="mt-auto flex items-center gap-2 pt-2">
            {contests.map((x, i) => (
              <button key={x.id} type="button" aria-label={`Xem ${x.title}`} onClick={() => setIndex(i)}
                className={`h-[7px] rounded-full transition-all ${i === index ? "w-[22px] bg-brand-gold-light" : "w-[7px] bg-white/30"}`} />
            ))}
          </div>
        )}
      </div>
      <ContestKeyVisual url={c.key_visual_url} title={c.title} className="aspect-video md:aspect-auto md:min-h-[420px]">
        <div aria-hidden className="absolute inset-0 hidden md:block" style={{ background: "linear-gradient(90deg, var(--color-brand-ink) 0%, transparent 30%)" }} />
      </ContestKeyVisual>
    </div>
  );
}
