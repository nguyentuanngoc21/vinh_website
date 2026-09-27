import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftIcon, InfoIcon } from "@phosphor-icons/react/dist/ssr";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { formatVnDateTime } from "@/lib/contests/datetime";
import { ContestError } from "@/lib/contests/errors";
import { CONTEST_STATUS_LABEL } from "@/lib/contests/labels";
import { getAuthorContestStats, type AuthorContestStats } from "@/lib/contests/stats-service";
import { buildKpis, retention, sourceShares } from "@/lib/contests/stats-view";

export const metadata: Metadata = { title: "Thống kê dự thi · Vịnh Tác giả" };

/**
 * Thống kê bài dự thi (Phase 2, Slice 2.7 — thiết kế "studio/contests/[slug]/stats").
 * Chỉ tác giả của bài (lọc theo người xem ở stats-service). Mọi chỉ số trừ số
 * phiếu hiện suốt cuộc thi; số phiếu ẩn đến khi hết bình chọn (P9). Không dùng
 * lượt xem trang. ?entry= chọn bài khi tác giả có nhiều bài trong cùng cuộc thi.
 */
export default async function AuthorContestStatsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ entry?: string }>;
}) {
  const [{ slug }, { entry }] = await Promise.all([params, searchParams]);
  const supabase = createServiceRoleClient();
  const viewerId = await getAuthedUserId(supabase);
  if (!viewerId) redirect(`/dang-nhap?next=/author/contests/${slug}/stats`);

  let data: AuthorContestStats;
  try {
    data = await getAuthorContestStats(supabase, { slug, viewerId, submissionId: entry ?? null });
  } catch (error) {
    if (error instanceof ContestError && (error.code === "contest_not_found" || error.code === "submission_not_found")) notFound();
    throw error;
  }
  const { stats } = data;
  const kpis = buildKpis(stats, data.votes);
  const sources = sourceShares(stats);
  const funnel = retention(stats);
  const base = `/author/contests/${data.contest.slug}/stats`;

  return (
    <main className="px-4 pb-12 pt-6 sm:px-8 lg:col-span-2 lg:overflow-y-auto lg:px-9 lg:pt-8">
      <Link href="/author/contests" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-stone-dark no-underline">
        <ArrowLeftIcon size={14} /> Cuộc thi của tôi
      </Link>
      <h1 className="mt-3 text-[24px] font-bold tracking-[-.4px] text-brand-ink sm:text-[26px]">Thống kê dự thi</h1>
      <p className="mt-1 text-sm text-slate">
        <b className="text-ink">{data.entry.book_title}</b> · {data.contest.title} · {CONTEST_STATUS_LABEL[data.contest.status]}
      </p>

      {data.contests.length > 1 && (
        <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:none]">
          {data.contests.map((c) => (
            <Link key={c.slug} href={`/author/contests/${c.slug}/stats`}
              className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[13.5px] font-semibold no-underline ${
                c.slug === data.contest.slug ? "bg-brand-ink text-white" : "bg-neutral-bg text-stone-dark"
              }`}>
              {c.title}
            </Link>
          ))}
        </div>
      )}
      {data.entries.length > 1 && (
        <div className="-mx-4 mt-2.5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:none]">
          {data.entries.map((e) => (
            <Link key={e.submission_id} href={`${base}?entry=${e.submission_id}`}
              className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-medium no-underline ${
                e.submission_id === data.entry.submission_id ? "border-brand-ink text-brand-ink" : "border-cream-border text-stone-dark"
              }`}>
              {e.book_title}
            </Link>
          ))}
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.key} className="flex flex-col gap-1 rounded-[14px] border border-cream-border bg-white p-3.5 sm:p-4">
            <div className="text-[12.5px] font-medium text-stone-alt">{k.label}</div>
            <div className="text-[22px] font-bold leading-tight text-brand-ink sm:text-[26px]">{k.value}</div>
            <div className="text-[12px] leading-snug text-stone-dark">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <section className="rounded-[14px] border border-cream-border bg-white p-4 sm:p-5">
          <h2 className="text-base font-bold text-ink">Nguồn độc giả</h2>
          <p className="mt-0.5 text-[12.5px] text-stone-alt">Theo lần đọc đầu tiên của mỗi người.</p>
          {sources.length === 0 ? (
            <p className="mt-4 text-sm text-stone-alt">Chưa có độc giả.</p>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {sources.map((s) => (
                <div key={s.source}>
                  <div className="mb-1 flex justify-between text-[13px]">
                    <span className="text-ink">{s.label}</span>
                    <span className="font-semibold text-brand-ink">{s.percent}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-neutral-bg">
                    <div className="h-full rounded-full bg-brand-gold" style={{ width: `${s.percent}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-[14px] border border-cream-border bg-white p-4 sm:p-5">
          <h2 className="text-base font-bold text-ink">Giữ chân theo chương</h2>
          <p className="mt-0.5 text-[12.5px] text-stone-alt">
            {stats.readers.toLocaleString("vi-VN")} người đã đọc · % so với người đọc chương 1.
          </p>
          {funnel.length === 0 || stats.readers === 0 ? (
            <p className="mt-4 text-sm text-stone-alt">Chưa có độc giả.</p>
          ) : (
            <div className="mt-4 flex flex-col gap-2">
              {funnel.map((f) => (
                <div key={f.position} className="grid grid-cols-[52px_minmax(0,1fr)_44px] items-center gap-2.5 text-[13px]">
                  <span className="text-stone-alt">Ch. {f.position}</span>
                  <div className="h-2 overflow-hidden rounded-full bg-neutral-bg" title={f.title}>
                    <div className="h-full rounded-full bg-brand-ink" style={{ width: `${f.percent}%` }} />
                  </div>
                  <span className="text-right font-semibold text-brand-ink">{f.percent}%</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="mt-5 flex items-start gap-2 text-[12.5px] leading-relaxed text-stone-alt">
        <InfoIcon size={15} className="mt-0.5 shrink-0" />
        <span>
          Số liệu từ {formatVnDateTime(stats.since)} (lúc cuộc thi mở nhận bài), không tính lượt bạn tự đọc và không dùng lượt xem trang.
          &ldquo;Độc giả đọc thật&rdquo; là người đọc đủ lâu so với độ dài chương — cùng số dùng cho xếp hạng.
          Số phiếu được ẩn đến khi kết thúc bình chọn.
          {data.scoresRefreshedAt ? ` Cập nhật ${formatVnDateTime(data.scoresRefreshedAt)}; tự làm mới tối đa 15 phút/lần.` : ""}
        </span>
      </div>
    </main>
  );
}
