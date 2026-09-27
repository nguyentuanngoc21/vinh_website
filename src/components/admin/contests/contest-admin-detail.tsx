"use client";

import { useState } from "react";
import { Tabs } from "@/components/ui";
import { ContestAwardsPanel } from "@/components/admin/contests/contest-awards-panel";
import { ContestForm } from "@/components/admin/contests/contest-form";
import { ContestFraudPanel } from "@/components/admin/contests/contest-fraud-panel";
import { ContestJudgingPanel } from "@/components/admin/contests/contest-judging-panel";
import { ContestStatusPanel } from "@/components/admin/contests/contest-status-panel";
import { ContestSubmissionsPanel } from "@/components/admin/contests/contest-submissions-panel";
import type { AdminAward, AdminSubmission } from "@/lib/contests/admin-service";
import type { AdminFraudSignal, FraudCounts } from "@/lib/contests/fraud-service";
import type { AdminJudge, JudgingOverview, ScoringConfigState } from "@/lib/contests/judging-service";
import type { AwardProposal, ScoreRunSummary } from "@/lib/contests/final-scoring-service";
import type { Database } from "@/lib/supabase/types";

type ContestRow = Database["public"]["Tables"]["contests"]["Row"];
type StatusEvent = Database["public"]["Tables"]["contest_status_events"]["Row"];

const TABS = [
  ["status", "Vòng đời"],
  ["info", "Thông tin & thể lệ"],
  ["submissions", "Bài dự thi"],
  ["awards", "Giải thưởng"],
  ["fraud", "Gian lận"],
  ["judging", "Chấm điểm"],
] as const;
type TabKey = (typeof TABS)[number][0];

export function ContestAdminDetail(props: {
  contest: ContestRow;
  events: StatusEvent[];
  submissions: { items: AdminSubmission[]; total: number; scores_refreshed_at: string | null };
  awards: AdminAward[];
  candidates: Pick<AdminSubmission, "id" | "book_title" | "author_name">[];
  resultsVisible: boolean;
  fraud: { items: AdminFraudSignal[]; counts: FraudCounts; canScan: boolean; locked: boolean };
  judging: { config: ScoringConfigState; judges: AdminJudge[]; overview: JudgingOverview; runs: ScoreRunSummary[] };
  proposals: AwardProposal[];
}) {
  const [tab, setTab] = useState<TabKey>("status");

  return (
    <div className="flex flex-col gap-5">
      <Tabs.List className="flex gap-1 overflow-x-auto border-b border-cream-border">
        {TABS.map(([key, label]) => (
          <Tabs.Tab
            key={key}
            active={tab === key}
            onClick={() => setTab(key)}
            className={`shrink-0 border-b-[3px] px-3 py-3 text-sm font-semibold transition-colors ${
              tab === key ? "border-brand-gold text-brand-ink" : "border-transparent text-stone-alt hover:text-brand-ink"
            }`}
          >
            {label}
            {key === "submissions" && <span className="ml-1.5 text-xs font-normal text-stone-alt">{props.submissions.total}</span>}
            {key === "fraud" && props.fraud.counts.open > 0 && (
              <span className="ml-1.5 rounded-full bg-error px-1.5 py-0.5 text-[11px] font-semibold text-white">{props.fraud.counts.open}</span>
            )}
          </Tabs.Tab>
        ))}
      </Tabs.List>

      {tab === "status" && <ContestStatusPanel contest={props.contest} events={props.events} />}
      {tab === "info" && <ContestForm contest={props.contest} />}
      {tab === "submissions" && <ContestSubmissionsPanel contestId={props.contest.id} initial={props.submissions} />}
      {tab === "awards" && (
        <ContestAwardsPanel
          contestId={props.contest.id}
          status={props.contest.status}
          resultsVisible={props.resultsVisible}
          awards={props.awards}
          candidates={props.candidates}
          proposals={props.proposals}
        />
      )}
      {tab === "judging" && (
        <ContestJudgingPanel contestId={props.contest.id} contestSlug={props.contest.slug}
          officialWindow={{ start: props.contest.official_scoring_start, end: props.contest.official_scoring_end }}
          initial={props.judging} />
      )}
      {tab === "fraud" && (
        <ContestFraudPanel contestId={props.contest.id} canScan={props.fraud.canScan} locked={props.fraud.locked}
          initial={{ items: props.fraud.items, counts: props.fraud.counts }} />
      )}
    </div>
  );
}
