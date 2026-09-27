import type { Metadata } from "next";
import Link from "next/link";
import { Lora } from "next/font/google";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftIcon, CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react/dist/ssr";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { JudgeScorecardForm } from "@/components/contests/judge-scorecard-form";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { ContestError } from "@/lib/contests/errors";
import { getJudgeEntry, type JudgeEntryView } from "@/lib/contests/judging-service";

const lora = Lora({ variable: "--font-lora", subsets: ["latin", "vietnamese"], weight: ["600"] });

export const metadata: Metadata = { title: "Chấm bài — Vịnh", robots: { index: false } };

/**
 * Chấm 1 bài (Slice 2.5b): đọc BẢN CHỤP lúc đóng nhận bài theo từng chương
 * (?chuong=N) + phiếu chấm theo rubric. Không hiện tên / ảnh tác giả (J7).
 * Mobile: bài đọc trước, phiếu chấm bên dưới; desktop: phiếu cố định bên phải.
 */
export default async function JudgeEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; submissionId: string }>;
  searchParams: Promise<{ chuong?: string }>;
}) {
  const [{ slug, submissionId }, { chuong }] = await Promise.all([params, searchParams]);
  const supabase = createServiceRoleClient();
  const viewerId = await getAuthedUserId(supabase);
  if (!viewerId) redirect(`/dang-nhap?next=/giam-khao/${slug}/${submissionId}`);

  let view: JudgeEntryView;
  try {
    view = await getJudgeEntry(supabase, { slug, submissionId, judgeId: viewerId, chapterIndex: Number(chuong) || 1 });
  } catch (error) {
    if (error instanceof ContestError && ["not_judge", "contest_not_found", "submission_not_found"].includes(error.code)) notFound();
    throw error;
  }
  const base = `/giam-khao/${view.contest.slug}/${view.entry.submission_id}`;
  const current = view.chapter?.index ?? 1;

  return (
    <div className={`flex-1 bg-neutral-bg ${lora.variable}`}>
      <div className="mx-auto max-w-[1280px] bg-white">
        <SiteHeader />
        <main className="px-4 pb-12 pt-6 sm:px-8 lg:px-11">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link href={`/giam-khao/${view.contest.slug}`} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-stone-dark no-underline">
              <ArrowLeftIcon size={14} /> {view.contest.title}
            </Link>
            <div className="flex gap-3 text-[13px] font-semibold">
              {view.prevId && <Link href={`/giam-khao/${view.contest.slug}/${view.prevId}`} className="inline-flex items-center gap-1 text-brand-ink no-underline"><CaretLeftIcon size={13} /> Bài trước</Link>}
              {view.nextId && <Link href={`/giam-khao/${view.contest.slug}/${view.nextId}`} className="inline-flex items-center gap-1 text-brand-ink no-underline">Bài sau <CaretRightIcon size={13} /></Link>}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <article className="min-w-0">
              <div className="text-xs font-semibold tracking-[1px] text-brand-gold-dark">BÀI {view.entry.code}</div>
              <h1 className="mt-1 font-[family-name:var(--font-lora)] text-[24px] font-semibold text-brand-ink sm:text-[28px]">{view.entry.book_title}</h1>
              <div className="mt-1 text-xs text-stone-alt">
                {view.entry.genre ?? "—"} · {view.entry.chapter_count} chương · {view.entry.total_words.toLocaleString("vi-VN")} chữ
                {view.entry.tags.length > 0 ? ` · ${view.entry.tags.join(", ")}` : ""}
              </div>
              {view.entry.synopsis && <p className="mt-3 text-[14px] leading-relaxed text-stone-dark">{view.entry.synopsis}</p>}

              {!view.entry.snapshot_ready ? (
                <div className="mt-6 rounded-[14px] border border-dashed border-cream-border p-6 text-sm text-stone-alt">Bản chụp của bài chưa sẵn sàng.</div>
              ) : (
                <>
                  <nav className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 [scrollbar-width:none]">
                    {view.chapters.map((c) => (
                      <Link key={c.index} href={`${base}?chuong=${c.index}`} scroll={false} title={c.title}
                        className={`shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-semibold no-underline ${
                          c.index === current ? "bg-brand-ink text-white" : "bg-neutral-bg text-stone-dark"
                        }`}>
                        Ch. {c.index}
                      </Link>
                    ))}
                  </nav>
                  {view.chapter && (
                    <section className="mt-5">
                      <h2 className="font-[family-name:var(--font-lora)] text-[20px] font-semibold text-ink">
                        Chương {view.chapter.index}: {view.chapter.title}
                      </h2>
                      <div className="mt-4 flex flex-col gap-4 text-[16.5px] leading-[1.8] text-ink">
                        {view.chapter.paragraphs.map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}
                      </div>
                      <div className="mt-6 flex justify-between text-[13px] font-semibold">
                        {current > 1 ? <Link href={`${base}?chuong=${current - 1}`} className="text-brand-ink no-underline">← Chương trước</Link> : <span />}
                        {current < view.chapters.length ? <Link href={`${base}?chuong=${current + 1}`} className="text-brand-ink no-underline">Chương sau →</Link> : <span />}
                      </div>
                    </section>
                  )}
                </>
              )}
            </article>

            <aside className="lg:sticky lg:top-4 lg:self-start">
              {view.rubric ? (
                <JudgeScorecardForm slug={view.contest.slug} submissionId={view.entry.submission_id} rubric={view.rubric}
                  canScore={view.canScore} scorecard={view.scorecard} />
              ) : (
                <div className="rounded-[14px] border border-dashed border-cream-border p-5 text-sm text-stone-alt">Ban tổ chức chưa lưu cấu hình chấm.</div>
              )}
            </aside>
          </div>
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
