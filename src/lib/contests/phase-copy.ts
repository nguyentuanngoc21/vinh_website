/**
 * Lời hiển thị theo giai đoạn cuộc thi (bảng Lifecycle, mục 7 của đặc tả UX
 * "Vịnh Cuộc thi Đặc tả.dc.html"; XIX.2 của docs/CONTEST_ENGINE_AUDIT_AND_PLAN.md).
 * Chỉ là lời + cấu trúc hiển thị — AI ĐƯỢC LÀM GÌ nằm ở capabilities.ts.
 */
import type { ContestStatus } from "@/lib/supabase/types";
import { CONTEST_STATUS_LABEL } from "@/lib/contests/labels";

export type PhaseTone = "hot" | "neutral" | "done";
export type CtaAction = "remind" | "submit" | "explore" | "entries" | "vote" | "results" | "rules" | "prizes" | "legacy";
export type Cta = { label: string; action: CtaAction };

export type PhaseCopy = {
  label: string;
  tone: PhaseTone;
  primary: Cta;
  secondary: Cta | null;
  /** Banner dưới tab (null = không có). */
  banner: string | null;
};

// D12: sau khi đóng nhận bài KHÔNG nói "tác giả không thể chỉnh sửa" —
// tác giả vẫn sửa truyện được, chỉ bản chụp lúc hạn mới được chấm.
const LOCKED_ENTRY = "Bản dự thi đã được chốt; chỉnh sửa sau thời điểm này không tính vào bản chấm.";

export const PHASE_COPY: Record<ContestStatus, PhaseCopy> = {
  draft: { label: CONTEST_STATUS_LABEL.draft, tone: "neutral", primary: { label: "Xem thể lệ", action: "rules" }, secondary: null,
    banner: "Bản nháp — chỉ Ban tổ chức nhìn thấy. Trang chưa xuất hiện trên /cuoc-thi." },
  announced: { label: CONTEST_STATUS_LABEL.announced, tone: "neutral", primary: { label: "Nhắc tôi khi mở", action: "remind" },
    secondary: { label: "Đọc thể lệ", action: "rules" }, banner: null },
  submission_open: { label: CONTEST_STATUS_LABEL.submission_open, tone: "hot", primary: { label: "Gửi tác phẩm dự thi", action: "submit" },
    secondary: { label: "Khám phá tác phẩm", action: "entries" }, banner: null },
  submission_closed: { label: CONTEST_STATUS_LABEL.submission_closed, tone: "neutral", primary: { label: "Khám phá tác phẩm", action: "entries" },
    secondary: null, banner: LOCKED_ENTRY },
  community_voting: { label: CONTEST_STATUS_LABEL.community_voting, tone: "hot", primary: { label: "Bình chọn", action: "vote" },
    secondary: { label: "Khám phá tác phẩm", action: "explore" }, banner: null },
  judging: { label: CONTEST_STATUS_LABEL.judging, tone: "neutral", primary: { label: "Khám phá tác phẩm", action: "entries" }, secondary: null,
    banner: "Ban giám khảo đang chấm. Bạn vẫn đọc và bình luận được; bình chọn đã khoá." },
  results: { label: CONTEST_STATUS_LABEL.results, tone: "done", primary: { label: "Xem kết quả", action: "results" },
    secondary: { label: "Xem giải thưởng", action: "prizes" }, banner: null },
  archived: { label: CONTEST_STATUS_LABEL.archived, tone: "done", primary: { label: "Xem kết quả", action: "results" },
    secondary: { label: "Dấu ấn mùa thi", action: "legacy" },
    banner: "Cuộc thi đã kết thúc và được lưu trữ vĩnh viễn. Mọi giải thưởng trên trang truyện đều dẫn về trang này để xác minh." },
};

export type TabKey = "kham-pha" | "bai" | "bxh" | "the-le" | "giai" | "ket-qua" | "tac-pham" | "dau-an";

const RUNNING_TABS: { key: TabKey; label: string }[] = [
  { key: "kham-pha", label: "Khám phá" },
  { key: "bai", label: "Bài dự thi" },
  { key: "bxh", label: "BXH" },
  { key: "the-le", label: "Thể lệ" },
  { key: "giai", label: "Giải thưởng" },
];
const FINISHED_TABS: { key: TabKey; label: string }[] = [
  { key: "ket-qua", label: "Kết quả" },
  { key: "tac-pham", label: "Tác phẩm" },
  { key: "giai", label: "Giải thưởng" },
  { key: "the-le", label: "Thể lệ" },
  { key: "dau-an", label: "Dấu ấn" },
];

export function isFinished(status: ContestStatus): boolean {
  return status === "results" || status === "archived";
}

/** URL không đổi suốt vòng đời; khi kết thúc chỉ đổi bộ tab (bai ↔ tac-pham). */
export function tabsFor(status: ContestStatus) {
  return isFinished(status) ? FINISHED_TABS : RUNNING_TABS;
}

export function resolveTab(status: ContestStatus, requested: string | null | undefined): TabKey {
  const tabs = tabsFor(status);
  let key = requested as TabKey | undefined;
  if (key === "bai" && isFinished(status)) key = "tac-pham";
  if (key === "tac-pham" && !isFinished(status)) key = "bai";
  return tabs.some((t) => t.key === key) ? (key as TabKey) : tabs[0].key;
}

/** Tab mà mỗi CTA dẫn tới (null = hành động riêng: nhắc, gửi bài). */
export function tabForAction(action: CtaAction, status: ContestStatus): TabKey | null {
  switch (action) {
    case "explore": return "kham-pha";
    case "entries":
    case "vote": return isFinished(status) ? "tac-pham" : "bai";
    case "results": return "ket-qua";
    case "rules": return "the-le";
    case "prizes": return "giai";
    case "legacy": return "dau-an";
    default: return null;
  }
}

export type Countdown = { label: string; target: string; mode: "countdown" | "date" };

/** Mốc đếm ngược của giai đoạn hiện tại (null nếu không có mốc). */
export function countdownFor(c: {
  status: ContestStatus;
  submission_start: string;
  submission_end: string;
  voting_start: string | null;
  voting_end: string | null;
  result_at: string | null;
}): Countdown | null {
  switch (c.status) {
    case "announced": return { label: "mở nhận bài sau", target: c.submission_start, mode: "countdown" };
    case "submission_open": return { label: "đóng nhận bài sau", target: c.submission_end, mode: "countdown" };
    case "submission_closed":
      return c.voting_start ? { label: "mở bình chọn sau", target: c.voting_start, mode: "countdown" }
        : c.result_at ? { label: "dự kiến công bố", target: c.result_at, mode: "date" } : null;
    case "community_voting": return c.voting_end ? { label: "kết thúc bình chọn sau", target: c.voting_end, mode: "countdown" } : null;
    case "judging": return c.result_at ? { label: "dự kiến công bố", target: c.result_at, mode: "date" } : null;
    default: return null;
  }
}

/** "12 ngày 04 giờ" / "05 giờ 21 phút" (dưới 48 giờ chuyển giờ:phút — đặc tả mục 7). */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return "0 phút";
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  if (ms >= 48 * 3_600_000) return `${days} ngày ${two(hours)} giờ`;
  return `${two(days * 24 + hours)} giờ ${two(mins)} phút`;
}

export type StepState = "done" | "current" | "upcoming";
export type Step = { label: string; date: string | null; state: StepState };

const STEP_OF: Record<ContestStatus, number> = {
  draft: -1, announced: 0, submission_open: 1, submission_closed: 2, community_voting: 3, judging: 4, results: 5, archived: 6,
};

/** 6 chặng công khai: Công bố, Nhận bài, Đóng bài, Bình chọn, Chấm giải, Kết quả. */
export function stepsFor(c: {
  status: ContestStatus;
  submission_start: string;
  submission_end: string;
  voting_start: string | null;
  judging_start: string | null;
  result_at: string | null;
  results_published_at: string | null;
}, announcedAt: string | null): Step[] {
  const current = STEP_OF[c.status];
  const raw: [string, string | null][] = [
    ["Công bố", announcedAt],
    ["Nhận bài", c.submission_start],
    ["Đóng bài", c.submission_end],
    ["Bình chọn", c.voting_start],
    ["Chấm giải", c.judging_start],
    ["Kết quả", c.results_published_at ?? c.result_at],
  ];
  return raw.map(([label, date], i) => ({
    label,
    date,
    state: current >= 6 || i < current ? "done" : i === current ? "current" : "upcoming",
  }));
}
