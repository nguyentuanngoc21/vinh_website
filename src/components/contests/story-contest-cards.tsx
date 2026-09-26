import Link from "next/link";
import { ArrowRightIcon, TrophyIcon } from "@phosphor-icons/react/dist/ssr";
import { VoteButton } from "@/components/contests/vote-button";
import type { StoryContestCard } from "@/lib/contests/public-view";

/**
 * Contest card trên trang truyện — đạt giải (lên đầu, dẫn về kết quả chính
 * thức để xác minh), đang dự thi (giai đoạn + hạn, nút bình chọn khi đang
 * bình chọn). Mobile: nằm ngay dưới nút Đọc, trước mô tả (đặc tả UX mục 6).
 */
export function StoryContestCards({ cards }: { cards: StoryContestCard[] }) {
  if (cards.length === 0) return null;
  return (
    <div className="mt-4 flex max-w-[560px] flex-col gap-2.5">
      {cards.map((card) =>
        card.kind === "award" ? (
          <Link key={`a-${card.contest.slug}-${card.award_name}`} href={`/cuoc-thi/${card.contest.slug}?tab=ket-qua`}
            className="flex items-center gap-3.5 rounded-[16px] bg-brand-ink px-4 py-3.5 text-white no-underline">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-brand-gold-light/20 text-brand-gold-light">
              <TrophyIcon size={22} weight="fill" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-extrabold text-brand-gold-light">{card.award_name}</span>
              <span className="block truncate text-[13.5px] text-hero-text">{card.contest.title}</span>
            </span>
            <span className="hidden shrink-0 items-center gap-1 text-[13px] font-semibold text-brand-gold-light sm:flex">
              Xem kết quả chính thức <ArrowRightIcon size={13} weight="bold" />
            </span>
          </Link>
        ) : (
          <div key={`e-${card.submission_id}`} className="rounded-[16px] border border-cream-gold-border bg-cream-card px-4 py-3.5">
            <div className="flex items-center gap-1.5 text-[11.5px] font-bold tracking-[.6px] text-brand-gold-dark">
              <TrophyIcon size={14} weight="fill" /> BÀI DỰ THI
            </div>
            <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="truncate text-[15.5px] font-bold text-brand-ink">{card.contest.title}</div>
                <div className="text-[12.5px] text-cream-gold-text">{card.phase_label}</div>
              </div>
              <Link href={`/cuoc-thi/${card.contest.slug}`} className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-brand-gold-dark no-underline">
                Xem cuộc thi <ArrowRightIcon size={13} weight="bold" />
              </Link>
            </div>
            {card.vote && <VoteButton slug={card.contest.slug} submissionId={card.submission_id} initial={card.vote} />}
          </div>
        )
      )}
      {cards.filter((c) => c.kind === "entry").length > 1 && (
        <p className="px-1 text-xs text-stone-light">Một tác phẩm có thể dự nhiều cuộc thi nếu thể lệ từng cuộc thi cho phép.</p>
      )}
    </div>
  );
}
