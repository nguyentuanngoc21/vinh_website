import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CaretRightIcon } from "@phosphor-icons/react/dist/ssr";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Alert } from "@/components/ui";
import { SubmitEntryFlow } from "@/components/contests/submit-entry-flow";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { capabilitiesFor, getContestBySlug, getContestViewer } from "@/lib/contests/contest-service";
import { readContestConfig } from "@/lib/contests/config";
import { formatVnDateTime } from "@/lib/contests/datetime";
import { ContestError } from "@/lib/contests/errors";
import { previewEligibility } from "@/lib/contests/submission-service";

export const metadata: Metadata = { title: "Gửi tác phẩm dự thi — Vịnh" };

const CLOSED_TEXT: Record<string, string> = {
  submission_not_open: "Cuộc thi chưa mở nhận bài.",
  submission_closed: "Cuộc thi đã hết hạn nhận bài.",
};

/**
 * Gửi tác phẩm dự thi — điểm vào chung cho microsite và trang truyện của tác
 * giả (?book= chọn sẵn truyện). Điều kiện được tính ở server cho mọi truyện
 * của tác giả trong 1 lượt; POST lại kiểm toàn bộ.
 */
export default async function SubmitEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ book?: string }>;
}) {
  const [{ slug }, { book }] = await Promise.all([params, searchParams]);
  const supabase = createServiceRoleClient();
  const viewerId = await getAuthedUserId(supabase);
  if (!viewerId) redirect(`/dang-nhap?next=${encodeURIComponent(`/cuoc-thi/${slug}/gui-bai${book ? `?book=${book}` : ""}`)}`);

  let contest;
  try {
    contest = await getContestBySlug(supabase, slug);
  } catch (error) {
    if (error instanceof ContestError && error.code === "contest_not_found") notFound();
    throw error;
  }
  const capabilities = capabilitiesFor(contest, await getContestViewer(supabase, viewerId), null);
  const books = capabilities.can_submit ? await previewEligibility(supabase, { contest, viewerId }) : [];

  return (
    <div className="flex-1 bg-neutral-bg">
      <div className="mx-auto max-w-[1280px] bg-white">
        <SiteHeader />
        <main className="mx-auto w-full max-w-[760px] px-4 pb-14 pt-7 sm:px-8">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px] text-stone-alt">
            <Link href="/cuoc-thi" className="text-stone-alt no-underline">Cuộc thi</Link>
            <CaretRightIcon size={10} weight="bold" />
            <Link href={`/cuoc-thi/${contest.slug}`} className="truncate text-stone-alt no-underline">{contest.title}</Link>
          </nav>
          <h1 className="mt-2 text-2xl font-bold text-ink">Gửi tác phẩm dự thi</h1>
          <p className="mt-1 text-sm text-stone-alt">{contest.title}</p>

          <div className="mt-6">
            {capabilities.can_submit ? (
              <SubmitEntryFlow
                slug={contest.slug}
                contestTitle={contest.title}
                deadlineText={formatVnDateTime(contest.submission_end)}
                rulesVersion={contest.rules_version}
                books={books}
                preselectBookId={book ?? null}
                requireExclusive={readContestConfig(contest).eligibility.require_exclusive}
              />
            ) : (
              <Alert tone="info">
                {CLOSED_TEXT[capabilities.reasons.can_submit ?? ""] ?? "Cuộc thi không nhận bài lúc này."}{" "}
                <Link href={`/cuoc-thi/${contest.slug}`} className="font-semibold text-brand-gold-dark">Về trang cuộc thi</Link>
              </Alert>
            )}
          </div>
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
