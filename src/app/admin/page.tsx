import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getOverviewStats } from "@/lib/admin/get-overview-stats";
import { getCopyrightCoverage } from "@/lib/admin/get-copyright-coverage";
import { getMonthlyPostsTrend, getWeeklySignupsTrend } from "@/lib/admin/get-content-trends";
import { OverviewKpis } from "@/components/admin/overview-kpis";
import { PostsChart } from "@/components/admin/posts-chart";
import { CopyrightPanel } from "@/components/admin/copyright-panel";
import { SignupsChart } from "@/components/admin/signups-chart";
import { RetentionCohort } from "@/components/admin/retention-cohort";
import { TransactionsTable } from "@/components/admin/transactions-table";

export const metadata: Metadata = {
  title: "Tổng quan · Vịnh Admin",
};

// Trang này trước đây 100% mock (dựng từ ngày đầu scaffold dự án, chưa
// từng đấu nối dữ liệu thật — xem lịch sử: commit "Add full project
// source"). Giờ fetch thật bằng service-role (giống /admin/noi-dung,
// /admin/tranh-chap) — admin cần thấy xuyên suốt mọi user, RLS thường sẽ
// chặn hầu hết các bảng liên quan.
export default async function AdminOverviewPage() {
  const supabase = createServiceRoleClient();
  const [overview, coverage, postsTrend, signupsTrend] = await Promise.all([
    getOverviewStats(supabase),
    getCopyrightCoverage(supabase),
    getMonthlyPostsTrend(supabase),
    getWeeklySignupsTrend(supabase),
  ]);

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-bold text-brand-ink">Tổng quan</h1>
          <p className="mt-0.5 text-sm text-stone-alt">30 ngày gần nhất</p>
        </div>
      </div>

      <OverviewKpis stats={overview} />

      <div className="mb-[18px] grid grid-cols-[1.6fr_1fr] gap-[18px]">
        <PostsChart points={postsTrend} />
        <CopyrightPanel coverage={coverage} />
      </div>

      <div className="mb-[18px] grid grid-cols-2 gap-[18px]">
        <SignupsChart points={signupsTrend} />
        <RetentionCohort />
      </div>

      <TransactionsTable transactions={overview.recentTransactions} />
    </>
  );
}
