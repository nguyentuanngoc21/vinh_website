import type { ContestSubmissionStatus } from "@/lib/supabase/types";
import type { ContestTimeline } from "@/lib/contests/capabilities";
import type { EligibilityRules } from "@/lib/contests/config";

/** preview = xem trước; submit = lúc nộp; close = kiểm lại lúc đóng cổng (D4 — chỉ gắn cờ). */
export type EligibilityPhase = "preview" | "submit" | "close";

export type EligibilityCheck = {
  code: string;
  passed: boolean;
  /** false = cảnh báo, vẫn nộp được. */
  blocking: boolean;
  /** Tiếng Việt, hiển thị cho tác giả — kèm số liệu thật. */
  message: string;
  details?: Record<string, unknown>;
};

/**
 * Mọi dữ liệu engine cần, nạp MỘT lần bởi submission-service (theo lô khi
 * xem trước nhiều sách) — rule không tự truy vấn DB.
 */
export type EligibilityContext = {
  now: Date;
  contest: ContestTimeline & { id: string; rules_version: string };
  rules: EligibilityRules;
  viewer: { userId: string; emailVerified: boolean; dateOfBirth: string | null };
  book: {
    id: string;
    author_id: string;
    title: string;
    published: boolean;
    deleted_at: string | null;
    genre: string | null;
    tags: string[];
    is_exclusive: boolean;
    published_at: string | null;
  };
  stats: { published_chapter_count: number; total_words: number; priced_chapter_count: number };
  /** Thỏa thuận "Chính sách độc quyền xuất bản" bản hiện hành (D11). */
  exclusivityAgreementAccepted: boolean;
  /** Bài của chính sách này trong cuộc thi này (nếu có). */
  thisSubmission: { status: ContestSubmissionStatus } | null;
  /** Bài đang dự thi của sách ở các cuộc thi KHÁC chưa kết thúc. */
  otherActiveEntries: { contest_id: string; contest_title: string; allow_multi_contest: boolean }[];
  /** Số bài hợp lệ của sách ở cuộc thi khác đã kết thúc (results/archived). */
  priorFinishedEntries: number;
  /** Số giải chưa thu hồi của sách ở cuộc thi khác. */
  priorAwards: number;
  /** Số bài đang dự thi của các sách KHÁC cùng tác giả trong cuộc thi này. */
  authorOtherActiveEntries: number;
  /** Chỉ có ở phase submit. */
  acceptedRulesVersion: string | null;
};

export type EligibilityRule = {
  code: string;
  phases: EligibilityPhase[];
  /** null = rule không bật với cấu hình của cuộc thi này. */
  evaluate(ctx: EligibilityContext): EligibilityCheck | null;
};

export type EligibilityResult = {
  /** Không có kiểm tra blocking nào trượt. */
  eligible: boolean;
  checks: EligibilityCheck[];
};
