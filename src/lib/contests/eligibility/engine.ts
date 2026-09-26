import { ELIGIBILITY_RULES } from "@/lib/contests/eligibility/rules";
import type {
  EligibilityContext,
  EligibilityPhase,
  EligibilityResult,
  EligibilityRule,
} from "@/lib/contests/eligibility/types";

/**
 * Chạy TẤT CẢ rule của phase (không dừng ở lỗi đầu tiên) để UI hiện đủ
 * "còn thiếu gì". Kết quả phase submit được lưu vào
 * contest_submissions.eligibility_result làm bằng chứng.
 */
export function evaluateEligibility(
  ctx: EligibilityContext,
  phase: EligibilityPhase,
  rules: EligibilityRule[] = ELIGIBILITY_RULES
): EligibilityResult {
  const checks = rules
    .filter((r) => r.phases.includes(phase))
    .map((r) => r.evaluate(ctx))
    .filter((c): c is NonNullable<typeof c> => c !== null);
  return { eligible: checks.every((c) => c.passed || !c.blocking), checks };
}
