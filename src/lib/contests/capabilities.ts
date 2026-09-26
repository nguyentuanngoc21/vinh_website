/**
 * Capability của cuộc thi cho 1 người xem tại 1 thời điểm (mục VI.2 +
 * XIX.2 của docs/CONTEST_ENGINE_AUDIT_AND_PLAN.md). Hàm thuần: server tính,
 * frontend chỉ render theo kết quả, không tự so deadline.
 *
 * Luôn kiểm CẢ status lẫn thời gian thực: cron đổi status chạy 1 lần/ngày,
 * nên status có thể còn 'submission_open' dù đã quá submission_end.
 */
import type { ContestReviewFlag, ContestStatus, ContestSubmissionStatus } from "@/lib/supabase/types";
import { CLOSING_SOON_HOURS, type EligibilityRules, type VoteRules } from "@/lib/contests/config";

export type FeedKind = "top" | "new" | "discover";

export type ContestTimeline = {
  status: ContestStatus;
  submission_start: string;
  submission_end: string;
  voting_start: string | null;
  voting_end: string | null;
  results_published_at: string | null;
};

export type ViewerSubmission = {
  status: ContestSubmissionStatus;
  review_flags: ContestReviewFlag[];
};

export type ContestViewer = {
  userId: string | null;
  /** auth.users.created_at — để báo sớm "tài khoản chưa đủ tuổi" cho nút bình chọn. */
  accountCreatedAt: string | null;
};

export type ReasonCode =
  | "not_logged_in"
  | "submission_not_open"
  | "submission_closed"
  | "withdraw_closed"
  | "not_withdrawn"
  | "resubmit_not_allowed"
  | "voting_not_open"
  | "voting_closed"
  | "account_too_new";

export type ContestCapabilities = {
  status: ContestStatus;
  can_submit: boolean;
  can_withdraw: boolean;
  can_resubmit: boolean;
  /** Chỉnh sửa sách còn được tính vào bản chấm (= trước submission_end). */
  can_edit_submission: boolean;
  /** Mức cuộc thi. Điều kiện theo từng bài: getEntryVoteState(). */
  can_vote: boolean;
  results_visible: boolean;
  rankings_visible: { popular: boolean; trending: boolean; jury: boolean; final: boolean };
  /** Q3: trong lúc bình chọn hiện hạng nhưng ẩn số phiếu. */
  popular_values_visible: boolean;
  available_feeds: FeedKind[];
  closing_soon: boolean;
  /** Mốc tương lai gần nhất làm đổi capability — UI tự làm mới đúng lúc. */
  next_change_at: string | null;
  needs_revision: boolean;
  revision_deadline: string | null;
  reasons: Partial<Record<"can_submit" | "can_withdraw" | "can_resubmit" | "can_vote", ReasonCode>>;
};

const ACTIVE_SUBMISSION: ContestSubmissionStatus[] = ["submitted", "eligible", "shortlisted"];

const t = (iso: string | null): number | null => (iso === null ? null : Date.parse(iso));

function isOrAfter(status: ContestStatus, ...statuses: ContestStatus[]): boolean {
  return statuses.includes(status);
}

export function isVotingOpen(contest: ContestTimeline, now: Date): boolean {
  const start = t(contest.voting_start);
  const end = t(contest.voting_end);
  const n = now.getTime();
  return contest.status === "community_voting" && start !== null && end !== null && n >= start && n < end;
}

export function isSubmissionOpen(contest: ContestTimeline, now: Date): boolean {
  const n = now.getTime();
  return contest.status === "submission_open" && n >= Date.parse(contest.submission_start) && n < Date.parse(contest.submission_end);
}

export function areResultsVisible(contest: ContestTimeline, now: Date): boolean {
  const published = t(contest.results_published_at);
  return isOrAfter(contest.status, "results", "archived") && published !== null && published <= now.getTime();
}

/** Còn cờ "Cần bổ sung" (XIX.6) chưa xử lý mà tác giả thấy được. */
export function openRevisionFlags(flags: ContestReviewFlag[]): ContestReviewFlag[] {
  return flags.filter((f) => f.visible_to_author && f.resolved_at === null);
}

export function getContestCapabilities(input: {
  contest: ContestTimeline;
  eligibility: Pick<EligibilityRules, "allow_resubmit_after_withdraw">;
  vote: Pick<VoteRules, "min_account_age_days">;
  viewer: ContestViewer;
  viewerSubmission: ViewerSubmission | null;
  now: Date;
}): ContestCapabilities {
  const { contest, eligibility, vote, viewer, viewerSubmission, now } = input;
  const n = now.getTime();
  const loggedIn = viewer.userId !== null;
  const reasons: ContestCapabilities["reasons"] = {};

  const submissionOpen = isSubmissionOpen(contest, now);
  const beforeDeadline = n < Date.parse(contest.submission_end);
  const hasActiveEntry = viewerSubmission !== null && ACTIVE_SUBMISSION.includes(viewerSubmission.status);

  const can_submit = loggedIn && submissionOpen;
  if (!loggedIn) reasons.can_submit = "not_logged_in";
  else if (!submissionOpen) reasons.can_submit = beforeDeadline ? "submission_not_open" : "submission_closed";

  const can_withdraw =
    viewerSubmission !== null &&
    (viewerSubmission.status === "submitted" || viewerSubmission.status === "eligible") &&
    beforeDeadline;
  if (viewerSubmission && !can_withdraw && !beforeDeadline) reasons.can_withdraw = "withdraw_closed";

  const can_resubmit =
    viewerSubmission?.status === "withdrawn" && eligibility.allow_resubmit_after_withdraw && can_submit;
  if (viewerSubmission && !can_resubmit) {
    reasons.can_resubmit =
      viewerSubmission.status !== "withdrawn"
        ? "not_withdrawn"
        : !eligibility.allow_resubmit_after_withdraw
          ? "resubmit_not_allowed"
          : (reasons.can_submit ?? "submission_closed");
  }

  const votingOpen = isVotingOpen(contest, now);
  const created = t(viewer.accountCreatedAt);
  const oldEnough = created !== null && n - created >= vote.min_account_age_days * 86_400_000;
  const can_vote = loggedIn && votingOpen && oldEnough;
  if (!loggedIn) reasons.can_vote = "not_logged_in";
  else if (!votingOpen) {
    const votingEnd = t(contest.voting_end);
    reasons.can_vote =
      isOrAfter(contest.status, "judging", "results", "archived") || (votingEnd !== null && n >= votingEnd)
        ? "voting_closed"
        : "voting_not_open";
  } else if (!oldEnough) reasons.can_vote = "account_too_new";

  const results_visible = areResultsVisible(contest, now);
  const votingEnd = t(contest.voting_end);
  const popularVisible = isOrAfter(contest.status, "community_voting", "judging", "results", "archived");
  const popular_values_visible =
    popularVisible &&
    (isOrAfter(contest.status, "judging", "results", "archived") || (votingEnd !== null && n >= votingEnd));

  const hasEntries = !isOrAfter(contest.status, "draft", "announced");
  const available_feeds: FeedKind[] = [];
  if (popularVisible) available_feeds.push("top");
  if (hasEntries) available_feeds.push("new", "discover");

  // Hạn của giai đoạn đang diễn ra — cho countdown / chip "Sắp đóng".
  const phaseDeadline =
    contest.status === "submission_open" ? Date.parse(contest.submission_end)
    : contest.status === "community_voting" ? votingEnd
    : null;
  const closing_soon =
    phaseDeadline !== null && n < phaseDeadline && phaseDeadline - n <= CLOSING_SOON_HOURS * 3_600_000;

  const upcoming = [contest.submission_start, contest.submission_end, contest.voting_start, contest.voting_end, contest.results_published_at]
    .map(t)
    .filter((x): x is number => x !== null && x > n);
  // Cảnh báo "Sắp đóng" bật ở đúng mốc 48 giờ trước hạn.
  if (phaseDeadline !== null && !closing_soon && phaseDeadline > n) {
    upcoming.push(phaseDeadline - CLOSING_SOON_HOURS * 3_600_000);
  }
  if (created !== null && !oldEnough) upcoming.push(created + vote.min_account_age_days * 86_400_000);
  const next = upcoming.length ? Math.min(...upcoming) : null;

  const flags = hasActiveEntry && viewerSubmission ? openRevisionFlags(viewerSubmission.review_flags) : [];
  const deadlines = flags.map((f) => f.fix_by).filter((d): d is string => d !== null).sort();

  return {
    status: contest.status,
    can_submit,
    can_withdraw,
    can_resubmit,
    can_edit_submission: hasActiveEntry && beforeDeadline,
    can_vote,
    results_visible,
    rankings_visible: { popular: popularVisible, trending: false, jury: results_visible, final: results_visible },
    popular_values_visible,
    available_feeds,
    closing_soon,
    next_change_at: next === null ? null : new Date(next).toISOString(),
    needs_revision: flags.length > 0,
    revision_deadline: deadlines[0] ?? null,
    reasons,
  };
}

export type EntryVoteReason =
  | ReasonCode
  | "entry_not_votable"
  | "own_entry"
  | "no_completed_chapter";

/**
 * Bình chọn cho 1 bài cụ thể — cùng thứ tự kiểm với cast_contest_vote() để
 * UI báo đúng lý do DB sẽ trả. Tính theo lô trong truy vấn feed (không gọi
 * riêng từng bài).
 */
export function getEntryVoteState(input: {
  capabilities: Pick<ContestCapabilities, "can_vote" | "reasons">;
  viewerId: string | null;
  entry: { author_id: string; status: ContestSubmissionStatus; book_visible: boolean };
  hasVoted: boolean;
  hasCompletedChapter: boolean;
  requireCompletedChapter: boolean;
}): { can_vote: boolean; has_voted: boolean; can_retract: boolean; reason: EntryVoteReason | null } {
  const { capabilities, viewerId, entry, hasVoted, hasCompletedChapter, requireCompletedChapter } = input;
  const votingReason = capabilities.reasons.can_vote;
  // Bỏ phiếu chỉ cần khung bình chọn đang mở (không cần đủ tuổi tài khoản).
  const windowOpen = votingReason === undefined || votingReason === "account_too_new";
  const can_retract = hasVoted && windowOpen;

  let reason: EntryVoteReason | null = null;
  if (votingReason && votingReason !== "account_too_new") reason = votingReason;
  else if (!(entry.status === "eligible" || entry.status === "shortlisted") || !entry.book_visible) reason = "entry_not_votable";
  else if (viewerId !== null && entry.author_id === viewerId) reason = "own_entry";
  else if (votingReason === "account_too_new") reason = "account_too_new";
  else if (requireCompletedChapter && !hasCompletedChapter) reason = "no_completed_chapter";

  return { can_vote: reason === null && !hasVoted && capabilities.can_vote, has_voted: hasVoted, can_retract, reason };
}
