import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TrophyIcon } from "@phosphor-icons/react/dist/ssr";
import { AuthorEntryCard } from "@/components/contests/author-entry-card";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { listAuthorContests } from "@/lib/contests/author-service";

export const metadata: Metadata = { title: "Cuộc thi của tôi · Vịnh Tác giả" };

/**
 * "Cuộc thi của tôi" — portfolio thi đấu của tác giả: ĐANG THAM GIA và ĐÃ KẾT
 * THÚC. /author/** đã được proxy.ts + layout gác đăng nhập. Analytics (độc
 * giả duy nhất, nguồn độc giả…) thuộc Phase 2.
 */
export default async function AuthorContestsPage() {
  const supabase = createServiceRoleClient();
  const viewerId = await getAuthedUserId(supabase);
  if (!viewerId) redirect("/dang-nhap?next=/author/contests");
  const { active, completed, totals } = await listAuthorContests(supabase, { viewerId });

  return (
    <main className="px-4 pb-12 pt-6 sm:px-8 lg:col-span-2 lg:overflow-y-auto lg:px-9 lg:pt-8">
      <h1 className="text-[24px] font-bold tracking-[-.4px] text-brand-ink sm:text-[26px]">Cuộc thi của tôi</h1>
      <div className="mt-3 flex flex-wrap gap-x-7 gap-y-1 text-sm text-slate">
        <span><b className="text-xl text-brand-ink">{totals.contests}</b> cuộc thi đã tham gia</span>
        <span><b className="text-xl text-brand-ink">{totals.awards}</b> giải thưởng</span>
      </div>

      <div className="mb-3 mt-8 text-xs font-semibold tracking-[1.2px] text-brand-gold-dark">ĐANG THAM GIA</div>
      {active.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-[14px] border border-dashed border-cream-border bg-white p-5 text-sm text-slate">
          Bạn chưa tham gia cuộc thi nào đang diễn ra.
          <Link href="/cuoc-thi" className="font-semibold text-brand-gold-dark">Xem các cuộc thi →</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {active.map((e) => <AuthorEntryCard key={e.submission_id} entry={e} showBook />)}
        </div>
      )}

      <div className="mb-3 mt-9 text-xs font-semibold tracking-[1.2px] text-brand-gold-dark">ĐÃ KẾT THÚC · PORTFOLIO</div>
      {completed.length === 0 ? (
        <p className="text-sm text-stone-alt">Thành tích từ các cuộc thi đã kết thúc sẽ hiện ở đây.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {completed.map((e) => {
            const award = e.awards.find((a) => !a.revoked);
            return (
              <Link key={e.submission_id} href={`/cuoc-thi/${e.contest.slug}?tab=ket-qua`}
                className={`flex flex-col gap-1.5 rounded-2xl border p-4 no-underline ${award ? "border-cream-gold-border bg-cream-card" : "border-cream-border bg-white"}`}>
                <div className="flex items-center gap-2 text-[13px] font-bold text-brand-gold-dark">
                  <TrophyIcon size={17} weight={award ? "fill" : "regular"} /> {award ? award.award_name : "Đã tham gia"}
                </div>
                <div className="text-base font-bold text-ink">{e.book_title}</div>
                <div className="text-[13px] text-stone-alt">{e.contest.title}</div>
                <div className="mt-1 text-[12.5px] font-semibold text-brand-gold-dark">Xem kết quả lưu trữ →</div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
