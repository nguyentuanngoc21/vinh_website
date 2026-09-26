import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowSquareOutIcon } from "@phosphor-icons/react/dist/ssr";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { Breadcrumbs } from "@/components/ui";
import { ContestAdminDetail } from "@/components/admin/contests/contest-admin-detail";
import { getContestById, getStatusEvents, listAwards, listSubmissionsForAdmin } from "@/lib/contests/admin-service";
import { areResultsVisible } from "@/lib/contests/capabilities";
import { ContestError } from "@/lib/contests/errors";
import { ensureFreshScores } from "@/lib/contests/scores-service";
import { CONTEST_STATUS_LABEL } from "@/lib/contests/labels";

export const metadata: Metadata = { title: "Cuộc thi · Vịnh Admin" };

export default async function AdminContestDetailPage({ params }: { params: Promise<{ contestId: string }> }) {
  const { contestId } = await params;
  const supabase = createServiceRoleClient();

  let contest;
  try {
    contest = await getContestById(supabase, contestId);
  } catch (error) {
    if (error instanceof ContestError && error.code === "contest_not_found") notFound();
    throw error;
  }

  // Làm mới bảng điểm (bỏ qua nếu chưa quá 15 phút) trước khi đọc số liệu.
  if (contest.status !== "draft") await ensureFreshScores(supabase, contestId);
  const [events, submissions, awards, eligible, shortlisted] = await Promise.all([
    getStatusEvents(supabase, contestId),
    listSubmissionsForAdmin(supabase, { contestId }),
    listAwards(supabase, contestId),
    listSubmissionsForAdmin(supabase, { contestId, status: "eligible", pageSize: 200 }),
    listSubmissionsForAdmin(supabase, { contestId, status: "shortlisted", pageSize: 200 }),
  ]);
  const candidates = [...shortlisted.items, ...eligible.items]
    .filter((s) => !s.book_removed)
    .map((s) => ({ id: s.id, book_title: s.book_title, author_name: s.author_name }));

  return (
    <>
      <Breadcrumbs items={[{ label: "Cuộc thi", href: "/admin/cuoc-thi" }, { label: contest.title }]} />
      <div className="mb-5 mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-[26px] font-bold text-brand-ink">{contest.title}</h1>
          <p className="mt-0.5 text-sm text-stone-alt">{CONTEST_STATUS_LABEL[contest.status]} · /cuoc-thi/{contest.slug}</p>
        </div>
        {contest.status !== "draft" && (
          <Link href={`/cuoc-thi/${contest.slug}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm font-semibold text-brand-gold-dark">
            Xem trang cuộc thi <ArrowSquareOutIcon size={14} />
          </Link>
        )}
      </div>
      <ContestAdminDetail
        contest={contest}
        events={events}
        submissions={submissions}
        awards={awards}
        candidates={candidates}
        resultsVisible={areResultsVisible(contest, new Date())}
      />
    </>
  );
}
