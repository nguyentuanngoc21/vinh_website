import { NextResponse } from "next/server";

/**
 * Chặn request vào các route cron (vercel.json) không mang
 * `Authorization: Bearer ${CRON_SECRET}` — header Vercel Cron tự gắn khi
 * biến môi trường được đặt.
 *
 * Thiếu CRON_SECRET: ở production TỪ CHỐI (fail closed) — trước đây mỗi
 * route chỉ log lỗi rồi vẫn chạy, nên ai biết URL cũng kích hoạt được dọn
 * nội dung / xoá tài khoản chưa xác nhận / quyết toán ví. Ở dev (next dev,
 * .env.local không có CRON_SECRET) vẫn cho chạy để test tay, kèm cảnh báo.
 *
 * Trả về `null` nếu hợp lệ, hoặc response 401/500 để route trả luôn.
 */
export function rejectUnauthorizedCron(request: Request, job: string): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error(`[cron] CRON_SECRET is not set — refusing to run ${job}.`);
      return NextResponse.json({ error: "Tác vụ định kỳ chưa được cấu hình." }, { status: 500 });
    }
    console.warn(`[cron] CRON_SECRET is not set — running ${job} unauthenticated (dev only).`);
    return null;
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Không có quyền chạy tác vụ này." }, { status: 401 });
  }
  return null;
}
