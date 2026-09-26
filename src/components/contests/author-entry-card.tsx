import Link from "next/link";
import { CheckCircleIcon, TrophyIcon, WarningIcon } from "@phosphor-icons/react/dist/ssr";
import { WithdrawButton } from "@/components/contests/withdraw-button";
import type { AuthorEntry } from "@/lib/contests/author-service";
import { formatVnDateTime } from "@/lib/contests/datetime";
import { CONTEST_STATUS_LABEL, SUBMISSION_STATUS_LABEL } from "@/lib/contests/labels";

const TONE: Record<AuthorEntry["status"], string> = {
  submitted: "bg-cream-card-alt text-stone-dark",
  eligible: "bg-success-form-bg text-success-form",
  shortlisted: "bg-brand-ink text-white",
  ineligible: "bg-error-bg text-error",
  disqualified: "bg-error-bg text-error",
  withdrawn: "bg-neutral-bg text-stone-dark",
};

/**
 * EntryPanel — 1 bài dự thi của tác giả: trạng thái, hạn chỉnh sửa, cảnh báo
 * "Cần bổ sung", hạng (khi BXH đã mở), giải (khi đã công bố). Dùng ở section
 * Cuộc thi của trang truyện và ở /author/contests.
 */
export function AuthorEntryCard({ entry, showBook }: { entry: AuthorEntry; showBook: boolean }) {
  const e = entry;
  const deadline = e.capabilities.can_edit_submission
    ? `Hạn chỉnh sửa: ${formatVnDateTime(e.contest.submission_end)}. Sau hạn, chương mới vẫn đăng được nhưng không tính vào bài dự thi.`
    : e.status === "eligible" || e.status === "shortlisted" || e.status === "submitted"
      ? "Bản dự thi đã được chốt; chỉnh sửa sau thời điểm này không tính vào bản chấm."
      : null;
  const rank = e.capabilities.rankings_visible.popular
    ? e.popular_rank !== null ? `Độc giả yêu thích: hạng #${e.popular_rank}` : "Độc giả yêu thích: ngoài top 100"
    : e.contest.voting_start ? `Xếp hạng mở từ ${formatVnDateTime(e.contest.voting_start).split(" ").pop()}` : null;
  const warn = e.capabilities.needs_revision;

  return (
    <div className={`flex flex-col gap-2.5 rounded-[14px] border p-4 ${warn ? "border-cream-gold-border bg-cream-card" : "border-cream-border bg-white"}`}>
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <Link href={`/cuoc-thi/${e.contest.slug}`} className="text-[15px] font-bold text-brand-ink no-underline">{e.contest.title}</Link>
          <div className="text-xs text-stone-alt">
            {CONTEST_STATUS_LABEL[e.contest.status]}
            {showBook && <> · <Link href={`/author/${e.book_id}`} className="text-stone-dark no-underline">{e.book_title}</Link></>}
          </div>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-xs font-semibold ${warn ? "bg-cream-gold text-cream-gold-text" : TONE[e.status]}`}>
          {warn ? <WarningIcon size={13} weight="fill" /> : <CheckCircleIcon size={13} weight="fill" />}
          {warn ? "Cần bổ sung" : SUBMISSION_STATUS_LABEL[e.status]}
        </span>
      </div>

      {e.status_reason && <div className="text-[13px] text-error">Lý do: {e.status_reason}</div>}
      {e.revision_flags.map((f) => (
        <div key={f.id} className="flex items-start gap-2 text-[13px] text-cream-gold-text">
          <WarningIcon size={15} weight="fill" className="mt-px shrink-0 text-brand-gold-dark" />
          <span>{f.message}{f.fix_by ? ` — bổ sung trước ${formatVnDateTime(f.fix_by)} để giữ tư cách dự thi.` : ""}</span>
        </div>
      ))}
      {deadline && <div className="text-[12.5px] leading-normal text-stone-dark">{deadline}</div>}
      {rank && <div className="text-[12.5px] font-semibold text-brand-ink">{rank}</div>}
      {e.awards.map((a) => (
        <div key={a.award_name} className={`flex items-center gap-1.5 text-[13px] font-semibold ${a.revoked ? "text-stone-alt line-through" : "text-brand-gold-dark"}`}>
          <TrophyIcon size={15} weight="fill" /> {a.award_name}{a.revoked ? " (đã thu hồi)" : ""}
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-0.5">
        <Link href={`/cuoc-thi/${e.contest.slug}`} className="text-[13px] font-semibold text-brand-gold-dark no-underline">Xem cuộc thi →</Link>
        {e.capabilities.results_visible && (
          <Link href={`/cuoc-thi/${e.contest.slug}?tab=ket-qua`} className="text-[13px] font-semibold text-brand-ink no-underline">Kết quả</Link>
        )}
        {e.capabilities.can_withdraw && (
          <WithdrawButton slug={e.contest.slug} submissionId={e.submission_id} bookTitle={e.book_title}
            canResubmit={e.contest.allow_resubmit_after_withdraw} />
        )}
        {e.status === "withdrawn" && e.contest.allow_resubmit_after_withdraw && e.contest.status === "submission_open" && (
          <Link href={`/cuoc-thi/${e.contest.slug}/gui-bai?book=${e.book_id}`} className="text-[13px] font-semibold text-brand-ink no-underline">Gửi lại</Link>
        )}
      </div>
    </div>
  );
}
