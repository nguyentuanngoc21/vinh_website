import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedAdminId } from "@/lib/wallet/session";
import { ContentReportsTable } from "@/components/admin/content-reports-table";

export const metadata = { title: "Báo cáo nội dung · Vịnh Admin" };
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const db = createServiceRoleClient();
  if (!await getAuthedAdminId(db)) return <p>Bạn không có quyền xem báo cáo.</p>;
  const query = await searchParams;
  const parsed = Number(query.page ?? 1);
  const page = Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 100000 ? parsed : 1;
  const { data, error } = await db.from("content_reports").select("*").order("created_at", { ascending: false }).order("id").range((page - 1) * 30, page * 30);
  const rows = (data ?? []).slice(0, 30);
  // Ai đã xử lý — tra username 1 lần cho cả trang.
  const reviewerIds = [...new Set(rows.map((r) => r.reviewed_by).filter((id): id is string => Boolean(id)))];
  const { data: reviewers } = reviewerIds.length
    ? await db.from("profiles").select("id, username").in("id", reviewerIds)
    : { data: [] as { id: string; username: string }[] };
  const reviewerUsernames = Object.fromEntries((reviewers ?? []).map((p) => [p.id, p.username]));
  return <><h1 className="mb-6 text-[26px] font-bold text-brand-ink">Báo cáo nội dung</h1>{error ? <p role="alert">Không thể tải báo cáo. Kiểm tra migration và thử lại.</p> : <ContentReportsTable rows={rows} page={page} hasMore={(data?.length ?? 0) > 30} reviewerUsernames={reviewerUsernames} />}</>;
}
