/**
 * Kiểm lại điều kiện lúc đóng nhận bài (D4 — chỉ gắn cờ, không đổi status).
 * Chạy trên SỐ LIỆU CỦA BẢN CHỤP (bản được chấm), không phải bản sống.
 *
 * Các rule phase "close" chỉ đọc ctx.rules và ctx.stats (min_published_chapters,
 * min_words, max_words) — close.test.ts giữ bất biến này — nên ngữ cảnh ở đây
 * chỉ cần 2 trường đó; các trường khác là giá trị trung tính.
 */
import type { EligibilityRules } from "@/lib/contests/config";
import type { ContestTimeline } from "@/lib/contests/capabilities";
import { evaluateEligibility } from "@/lib/contests/eligibility/engine";
import type { EligibilityCheck, EligibilityContext } from "@/lib/contests/eligibility/types";

/** Mã cờ hệ thống theo rule trượt lúc đóng cổng. */
export const CLOSE_FLAG_CODE: Record<string, string> = {
  min_published_chapters: "below_min_chapters_at_close",
  min_words: "below_min_words_at_close",
  max_words: "above_max_words_at_close",
};

export function evaluateCloseChecks(input: {
  contest: ContestTimeline & { id: string; rules_version: string };
  rules: EligibilityRules;
  stats: { chapter_count: number; total_words: number };
  now: Date;
}): EligibilityCheck[] {
  const ctx: EligibilityContext = {
    now: input.now,
    contest: input.contest,
    rules: input.rules,
    viewer: { userId: "", emailVerified: true, dateOfBirth: null },
    book: { id: "", author_id: "", title: "", published: true, deleted_at: null, genre: null, tags: [], is_exclusive: true, published_at: null },
    stats: { published_chapter_count: input.stats.chapter_count, total_words: input.stats.total_words, priced_chapter_count: 0 },
    exclusivityAgreementAccepted: true,
    thisSubmission: null,
    otherActiveEntries: [],
    priorFinishedEntries: 0,
    priorAwards: 0,
    authorOtherActiveEntries: 0,
    acceptedRulesVersion: null,
  };
  return evaluateEligibility(ctx, "close").checks.filter((c) => !c.passed && c.blocking);
}
