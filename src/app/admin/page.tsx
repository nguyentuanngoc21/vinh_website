import type { Metadata } from "next";
import { OverviewKpis } from "@/components/admin/overview-kpis";
import { PostsChart } from "@/components/admin/posts-chart";
import { CopyrightPanel } from "@/components/admin/copyright-panel";
import { SignupsChart } from "@/components/admin/signups-chart";
import { RetentionCohort } from "@/components/admin/retention-cohort";
import { TransactionsTable } from "@/components/admin/transactions-table";

export const metadata: Metadata = {
  title: "Tổng quan · Vịnh Admin",
};

const RANGE_OPTIONS = [
  { label: "7 ngày" },
  { label: "30 ngày", active: true },
  { label: "Năm" },
];

export default function AdminOverviewPage() {
  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-bold text-brand-ink">Tổng quan</h1>
          <p className="mt-0.5 text-sm text-stone-alt">
            Cập nhật 24/06/2026 · 14:32
          </p>
        </div>
        <div className="flex gap-2 rounded-[10px] border border-cream-border bg-white p-1">
          {RANGE_OPTIONS.map((range) => (
            <div
              key={range.label}
              className={`rounded-[7px] px-[14px] py-[7px] text-[13px] font-semibold ${
                range.active
                  ? "bg-brand-ink text-white"
                  : "text-stone-alt"
              }`}
            >
              {range.label}
            </div>
          ))}
        </div>
      </div>

      <OverviewKpis />

      <div className="mb-[18px] grid grid-cols-[1.6fr_1fr] gap-[18px]">
        <PostsChart />
        <CopyrightPanel />
      </div>

      <div className="mb-[18px] grid grid-cols-2 gap-[18px]">
        <SignupsChart />
        <RetentionCohort />
      </div>

      <TransactionsTable />
    </>
  );
}
