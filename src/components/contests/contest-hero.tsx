import Link from "next/link";
import { CaretRightIcon, WarningIcon } from "@phosphor-icons/react/dist/ssr";
import { ContestKeyVisual } from "@/components/contests/contest-key-visual";
import { Countdown } from "@/components/contests/countdown";
import { LifecycleStepper } from "@/components/contests/lifecycle-stepper";
import { PhaseChip } from "@/components/contests/phase-chip";
import { RemindButton } from "@/components/contests/remind-button";
import type { ContestCapabilities } from "@/lib/contests/capabilities";
import { formatVnDateTime } from "@/lib/contests/datetime";
import { SUBMISSION_STATUS_LABEL } from "@/lib/contests/labels";
import { countdownFor, PHASE_COPY, stepsFor, tabForAction, type Cta } from "@/lib/contests/phase-copy";
import type { PublicContest, ViewerEntry } from "@/lib/contests/public-view";

const SUBMIT_REASON: Record<string, string> = {
  not_logged_in: "Đăng nhập để gửi tác phẩm",
  submission_not_open: "Chưa đến giờ nhận bài",
  submission_closed: "Đã hết hạn nhận bài",
};

const pill = "flex min-h-[46px] items-center justify-center rounded-full px-7 py-3 text-[15px] font-semibold no-underline";

function CtaLink({ cta, contest, capabilities, loggedIn, reminderOn, primary }: {
  cta: Cta;
  contest: PublicContest;
  capabilities: ContestCapabilities;
  loggedIn: boolean;
  reminderOn: boolean;
  primary: boolean;
}) {
  const style = primary ? `${pill} bg-brand-gold text-brand-ink` : `${pill} border border-white/30 text-white`;
  if (cta.action === "remind") return <RemindButton slug={contest.slug} initialOn={reminderOn} loggedIn={loggedIn} />;
  if (cta.action === "submit") {
    if (!loggedIn) return <Link href={`/dang-nhap?next=${encodeURIComponent(`/cuoc-thi/${contest.slug}/gui-bai`)}`} className={style}>{cta.label}</Link>;
    if (!capabilities.can_submit) {
      return <span className={`${pill} cursor-not-allowed bg-white/15 text-hero-text`}>{SUBMIT_REASON[capabilities.reasons.can_submit ?? ""] ?? cta.label}</span>;
    }
    return <Link href={`/cuoc-thi/${contest.slug}/gui-bai`} className={style}>{cta.label}</Link>;
  }
  const tab = tabForAction(cta.action, contest.status);
  return <Link href={`/cuoc-thi/${contest.slug}?tab=${tab}`} scroll={false} className={style}>{cta.label}</Link>;
}

/**
 * ContestHero của microsite — key visual full-bleed, chip giai đoạn, tên,
 * slogan, CTA theo capability, 3 chỉ số, stepper 6 chặng. Mobile: chỉ số
 * thành 1 hàng 3 cột, CTA full-width.
 */
export function ContestHero({
  contest,
  capabilities,
  counts,
  announcedAt,
  loggedIn,
  reminderOn,
  viewerEntries,
  bookTitles,
}: {
  contest: PublicContest;
  capabilities: ContestCapabilities;
  counts: { entries: number; authors: number };
  announcedAt: string | null;
  loggedIn: boolean;
  reminderOn: boolean;
  viewerEntries: ViewerEntry[];
  bookTitles: Map<string, string>;
}) {
  const phase = PHASE_COPY[contest.status];
  const cd = countdownFor(contest);
  const steps = stepsFor(contest, announcedAt);

  return (
    <ContestKeyVisual url={contest.key_visual_url} title={contest.title} className="text-white">
      <div aria-hidden className="absolute inset-0"
        style={{ background: "linear-gradient(90deg, rgb(20 59 77 / .97) 0%, rgb(20 59 77 / .86) 45%, rgb(20 59 77 / .35) 100%)" }} />
      <div className="relative px-4 pt-5 sm:px-8 lg:px-11">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px] text-sidebar-text-dim-2">
          <Link href="/cuoc-thi" className="text-sidebar-text-dim-2 no-underline hover:text-white">Cuộc thi</Link>
          <CaretRightIcon size={10} weight="bold" />
          <span className="truncate text-white">{contest.title}</span>
        </nav>
      </div>

      <div className="relative grid grid-cols-1 gap-6 px-4 pb-6 pt-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-8 lg:px-11 lg:pb-7">
        <div className="flex max-w-[640px] flex-col gap-3.5">
          <PhaseChip label={capabilities.closing_soon ? `${phase.label} · Sắp đóng` : phase.label} tone={phase.tone} dark />
          <h1 className="text-[32px] font-bold leading-[1.06] tracking-[-1px] sm:text-[46px]">{contest.title}</h1>
          {contest.short_description && <p className="text-base leading-relaxed text-hero-text-dim">{contest.short_description}</p>}
          <div className="mt-1.5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <CtaLink cta={phase.primary} primary contest={contest} capabilities={capabilities} loggedIn={loggedIn} reminderOn={reminderOn} />
            {phase.secondary && (
              <CtaLink cta={phase.secondary} primary={false} contest={contest} capabilities={capabilities} loggedIn={loggedIn} reminderOn={reminderOn} />
            )}
          </div>
          {viewerEntries.length > 0 && (
            <div className="mt-1 flex flex-col gap-1.5 rounded-[14px] border border-white/15 bg-white/10 px-4 py-3 text-[13.5px]">
              <div className="font-semibold text-brand-gold-light">Bài dự thi của bạn</div>
              {viewerEntries.map((e) => (
                <div key={e.id} className="flex flex-col">
                  <span>
                    {bookTitles.get(e.book_id) ?? "Tác phẩm"} · <span className="text-hero-text-dim">{SUBMISSION_STATUS_LABEL[e.status]}</span>
                  </span>
                  {e.status_reason && <span className="text-xs text-hero-text-dim">Lý do: {e.status_reason}</span>}
                  {e.revision_flags.map((f) => (
                    <span key={f.id} className="flex items-start gap-1.5 text-xs text-brand-gold-light">
                      <WarningIcon size={14} weight="fill" className="mt-px shrink-0" />
                      Cần bổ sung: {f.message}{f.fix_by ? ` — trước ${formatVnDateTime(f.fix_by)}` : ""}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2.5 lg:flex">
          <div className="rounded-[14px] border border-white/15 bg-white/10 px-4 py-3.5 lg:min-w-[110px]">
            <div className="text-2xl font-bold">{counts.entries}</div><div className="text-xs text-sidebar-text-dim-2">tác phẩm</div>
          </div>
          <div className="rounded-[14px] border border-white/15 bg-white/10 px-4 py-3.5 lg:min-w-[110px]">
            <div className="text-2xl font-bold">{counts.authors}</div><div className="text-xs text-sidebar-text-dim-2">tác giả</div>
          </div>
          {cd && (
            <Countdown data={cd} refreshAt={capabilities.next_change_at}
              className="rounded-[14px] border border-brand-gold-light/35 bg-brand-gold/15 px-4 py-3.5 text-brand-gold-light lg:min-w-[150px]"
              labelClassName="opacity-85" />
          )}
        </div>
      </div>

      <div className="relative px-4 pb-6 sm:px-8 lg:px-11">
        <LifecycleStepper steps={steps} />
      </div>

      {/* Không có đồng hồ ở giai đoạn này nhưng capability vẫn có thể đổi (vd
          mốc bình chọn) — vẫn hẹn làm mới trang đúng lúc. */}
      {!cd && capabilities.next_change_at && (
        <Countdown data={{ label: "", target: capabilities.next_change_at, mode: "countdown" }} refreshAt={capabilities.next_change_at} className="hidden" />
      )}
    </ContestKeyVisual>
  );
}
