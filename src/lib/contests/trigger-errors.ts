/**
 * Lỗi từ 2 trigger của Contest Engine trên bảng có sẵn (errcode
 * check_violation + hint riêng — migrations/20260926_add_contest_engine_core.sql):
 *   - contest_paid_chapter (D8): chương của sách đang dự thi không được có giá;
 *   - contest_exclusive_lock (D11): không tắt độc quyền khi đang dự thi cuộc
 *     thi yêu cầu độc quyền.
 * Các route ghi giá chương / độc quyền đổi lỗi này thành 409 kèm thông báo
 * tiếng Việt thay vì 500 "Lưu thất bại".
 */
import { NextResponse } from "next/server";
import { ContestError } from "@/lib/contests/errors";

const LOCK_HINTS = new Set(["contest_paid_chapter", "contest_exclusive_lock"]);

export function contestLockResponse(error: { hint?: string | null } | null | undefined): NextResponse | null {
  if (!error?.hint || !LOCK_HINTS.has(error.hint)) return null;
  const e = new ContestError(error.hint as "contest_paid_chapter" | "contest_exclusive_lock");
  return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
}
