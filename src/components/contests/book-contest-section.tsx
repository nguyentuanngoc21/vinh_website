import Link from "next/link";
import { PlusIcon, TrophyIcon } from "@phosphor-icons/react/dist/ssr";
import { AuthorEntryCard } from "@/components/contests/author-entry-card";
import type { BookContestPanel } from "@/lib/contests/author-service";
import { formatVnDateTime } from "@/lib/contests/datetime";

/**
 * Section "Cuộc thi" trong trang truyện của tác giả (/author/[bookId]).
 * Không phải trình soạn riêng cho cuộc thi — chỉ hiện bài dự thi của truyện
 * và các cuộc thi đang nhận bài kèm điều kiện; gửi bài đi qua cùng trang
 * /cuoc-thi/[slug]/gui-bai với điểm vào từ microsite.
 */
export function BookContestSection({ bookId, panel }: { bookId: string; panel: BookContestPanel }) {
  const eligibleCount = panel.open.filter((o) => o.eligibility.eligible).length;

  return (
    <section className="mb-6 rounded-[14px] border border-cream-border bg-white p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2 text-xs font-bold tracking-[1px] text-brand-gold-dark">
        <TrophyIcon size={16} weight="fill" /> CUỘC THI
      </div>

      {panel.entries.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          {panel.entries.map((e) => <AuthorEntryCard key={e.submission_id} entry={e} showBook={false} />)}
        </div>
      ) : (
        <div className="text-sm text-slate">
          Chưa gửi dự thi
          {panel.open.length > 0 && (
            <div className="mt-1 text-[12.5px] text-stone-light">
              {eligibleCount > 0 ? `${eligibleCount} cuộc thi đang nhận bài phù hợp với truyện này.` : "Có cuộc thi đang nhận bài — xem điều kiện bên dưới."}
            </div>
          )}
        </div>
      )}

      {panel.open.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          <div className="text-[13px] font-semibold text-slate">{panel.entries.length > 0 ? "Tham gia cuộc thi khác" : "Cuộc thi đang nhận bài"}</div>
          {panel.open.map((o) => {
            const failed = o.eligibility.checks.filter((c) => !c.passed && c.blocking);
            return (
              <div key={o.contest.id} className="flex flex-col gap-2 rounded-[12px] border border-dashed border-brand-gold/60 bg-cream-card/50 p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-ink">{o.contest.title}</div>
                  <div className={`text-xs ${o.eligibility.eligible ? "text-success-form" : "text-stone-alt"}`}>
                    {o.eligibility.eligible ? `Đủ điều kiện · hạn ${formatVnDateTime(o.contest.submission_end)}` : `Chưa đủ điều kiện · ${failed[0]?.message ?? ""}`}
                  </div>
                </div>
                <Link href={`/cuoc-thi/${o.contest.slug}/gui-bai?book=${bookId}`}
                  className="flex min-h-[40px] shrink-0 items-center justify-center gap-1.5 rounded-[10px] border border-brand-gold px-4 py-2 text-[13.5px] font-semibold text-brand-gold-dark no-underline">
                  <PlusIcon size={14} weight="bold" /> {o.eligibility.eligible ? "Gửi tác phẩm dự thi" : "Xem điều kiện"}
                </Link>
              </div>
            );
          })}
        </div>
      )}

      {panel.entries.length === 0 && panel.open.length === 0 && (
        <p className="mt-1 text-[12.5px] text-stone-light">
          Hiện không có cuộc thi nào nhận bài. <Link href="/cuoc-thi" className="font-semibold text-brand-gold-dark">Xem các cuộc thi</Link>
        </p>
      )}
    </section>
  );
}
