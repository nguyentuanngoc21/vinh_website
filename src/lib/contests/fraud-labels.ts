/**
 * Nhãn + mô tả tín hiệu gian lận cho màn admin (Phase 2, Slice 2.4). Mã và
 * bằng chứng do detect_contest_fraud_signals() ghi — xem
 * migrations/20260926_add_contest_fraud_detection.sql.
 */
import type { ContestFraudSeverity, ContestFraudStatus } from "@/lib/supabase/types";
import { formatVnDateTime } from "@/lib/contests/datetime";

export const FRAUD_SIGNAL_LABEL: Record<string, string> = {
  rapid_voting: "Bình chọn dồn dập",
  new_account_mass_voting: "Tài khoản vừa đủ tuổi bầu hàng loạt",
};

export const FRAUD_SEVERITY_LABEL: Record<ContestFraudSeverity, string> = {
  low: "Thấp",
  medium: "Trung bình",
  high: "Cao",
};

export const FRAUD_STATUS_LABEL: Record<ContestFraudStatus, string> = {
  open: "Chờ xét",
  confirmed: "Đã xác nhận",
  dismissed: "Đã bỏ qua",
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/** Một câu mô tả bằng chứng lúc phát hiện; mã lạ → trả null (UI chỉ hiện mã). */
export function describeFraudSignal(code: string, evidence: Record<string, unknown>): string | null {
  if (code === "rapid_voting") {
    const votes = num(evidence.votes_in_window);
    const minutes = num(evidence.window_minutes);
    const start = str(evidence.window_start);
    if (votes === null || minutes === null) return null;
    return `${votes} phiếu trong ${minutes} phút${start ? ` (từ ${formatVnDateTime(start)})` : ""}.`;
  }
  if (code === "new_account_mass_voting") {
    const age = num(evidence.account_age_days_at_first_vote);
    const votes = num(evidence.votes);
    if (age === null || votes === null) return null;
    return `Tài khoản ${age.toLocaleString("vi-VN")} ngày tuổi lúc bỏ phiếu đầu tiên, đã bầu ${votes} tác phẩm.`;
  }
  return null;
}
