import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { ContestError } from "@/lib/contests/errors";
import { CONTEST_STATUS_LABEL } from "@/lib/contests/labels";
import { getJudgeContest, type JudgeContestView } from "@/lib/contests/judging-service";

export const metadata: Metadata = { title: "Chấm giải — Vịnh", robots: { index: false } };

const STATUS_TEXT = { draft: "Nháp", finalized: "Đã chốt", invalidated: "Đã huỷ" } as const;

/** Danh sách bài của 1 cuộc thi cho giám khảo — mã ẩn danh, không tác giả (J7). */
export default async function JudgeContestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createServiceRoleClient();
  const viewerId = await getAuthedUserId(supabase);
  if (!viewerId) redirect(`/dang-nhap?next=/giam-khao/${slug}`);

  let view: JudgeContestView;
  try {
    view = await getJudgeContest(supabase, { slug, judgeId: viewerId });
  } catch (error) {
    // Không phải giám khảo → 404 (không lộ cuộc thi đang chấm gì).
    if (error instanceof ContestError && (error.code === "not_judge" || error.code === "contest_not_found")) notFound();
    throw error;
  }
  const done = view.entries.filter((e) => e.mine?.status === "finalized").length;

  return (
    <div className="flex-1 bg-neutral-bg">
      <div className="mx-auto max-w-[1280px] bg-surface">
        <SiteHeader />
        <main className="px-4 pb-12 pt-6 sm:px-8 lg:px-11">
          <Link href="/giam-khao" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-stone-dark no-underline">
            <ArrowLeftIcon size={14} /> Chấm giải
          </Link>
          <h1 className="mt-3 text-[22px] font-bold text-brand-ink sm:text-[26px]">{view.contest.title}</h1>
          <p className="mt-1 text-sm text-stone-alt">
            {CONTEST_STATUS_LABEL[view.contest.status]} · đã chốt {done}/{view.entries.length} bài
            {!view.rubric ? " · Ban tổ chức chưa lưu cấu hình chấm" : ""}
          </p>

          {view.entries.length === 0 ? (
            <div className="mt-6 rounded-[14px] border border-dashed border-cream-border p-6 text-sm text-stone-alt">Chưa có bài hợp lệ.</div>
          ) : (
            <div className="mt-5 flex flex-col gap-2">
              {view.entries.map((e) => (
                <Link key={e.submission_id} href={`/giam-khao/${view.contest.slug}/${e.submission_id}`}
                  className="flex flex-col gap-1 rounded-[12px] border border-cream-border px-4 py-3 no-underline sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-ink"><span className="text-stone-alt">{e.code}</span> · {e.book_title}</div>
                    <div className="text-xs text-stone-alt">
                      {e.genre ?? "—"} · {e.chapter_count} chương · {e.total_words.toLocaleString("vi-VN")} chữ
                    </div>
                  </div>
                  <span className={`shrink-0 self-start rounded-full px-2.5 py-1 text-[11px] font-semibold sm:self-auto ${
                    e.mine?.status === "finalized" ? "bg-success-form-bg text-success-form" : e.mine ? "bg-cream-card-alt text-stone-dark" : "bg-neutral-bg text-stone-dark"
                  }`}>
                    {e.mine ? `${STATUS_TEXT[e.mine.status]} · ${e.mine.total.toLocaleString("vi-VN")}` : "Chưa chấm"}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
