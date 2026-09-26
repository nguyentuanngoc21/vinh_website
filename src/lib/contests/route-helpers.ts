import { NextResponse } from "next/server";
import type { ContestStatus, ContestSubmissionStatus } from "@/lib/supabase/types";
import { ContestError } from "@/lib/contests/errors";

/** Lỗi nghiệp vụ → status + thông báo tiếng Việt; lỗi khác → 500 (log, không lộ chi tiết). */
export function contestErrorResponse(error: unknown, context: string) {
  if (error instanceof ContestError) {
    return NextResponse.json(
      { error: error.message, code: error.code, details: error.details ?? null },
      { status: error.status, headers: { "Cache-Control": "private, no-store" } }
    );
  }
  console.error(`[contests] ${context}:`, error);
  return NextResponse.json({ error: "Có lỗi xảy ra. Vui lòng thử lại." }, { status: 500 });
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new ContestError("invalid_input");
  return body as Record<string, unknown>;
}

const CONTEST_STATUSES: ContestStatus[] = [
  "draft", "announced", "submission_open", "submission_closed", "community_voting", "judging", "results", "archived",
];
const SUBMISSION_STATUSES: ContestSubmissionStatus[] = [
  "submitted", "eligible", "ineligible", "withdrawn", "disqualified", "shortlisted",
];

export function parseContestStatus(v: unknown): ContestStatus {
  if (typeof v === "string" && (CONTEST_STATUSES as string[]).includes(v)) return v as ContestStatus;
  throw new ContestError("invalid_input", ["Trạng thái cuộc thi không hợp lệ"]);
}

export function parseSubmissionStatus(v: unknown): ContestSubmissionStatus {
  if (typeof v === "string" && (SUBMISSION_STATUSES as string[]).includes(v)) return v as ContestSubmissionStatus;
  throw new ContestError("invalid_input", ["Trạng thái bài dự thi không hợp lệ"]);
}

export function optionalText(v: unknown, max = 2000): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") throw new ContestError("invalid_input");
  const t = v.trim();
  if (t.length > max) throw new ContestError("invalid_input", [`Tối đa ${max} ký tự`]);
  return t || null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id không phải UUID không khớp dòng nào — trả 404 thay vì để Postgres báo lỗi kiểu (500). */
export function requireUuid(v: unknown, code: "book_not_found" | "submission_not_found" | "contest_not_found" | "award_not_found"): string {
  if (typeof v !== "string" || !UUID.test(v)) throw new ContestError(code);
  return v;
}
