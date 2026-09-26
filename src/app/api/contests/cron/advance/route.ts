import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { advanceDueContests } from "@/lib/contests/lifecycle-service";
import { refreshAllActiveScores } from "@/lib/contests/scores-service";

/**
 * Scheduled qua vercel.json (hằng ngày, 00:05 giờ Việt Nam — ngay sau các hạn
 * 23:59) — bắt kịp các chuyển trạng thái theo giờ của cuộc thi:
 *   - announced → submission_open khi qua submission_start (+ gửi nhắc, Q4);
 *   - submission_open → submission_closed khi qua submission_end, chụp bản dự
 *     thi và gắn cờ điều kiện lúc đóng cho admin (D3, D4);
 *   - tính lại bảng điểm (phiếu đã lọc, độc giả hợp lệ, trending) của mọi
 *     cuộc thi đang diễn ra — lưới an toàn 0h giờ VN cho làm mới lười 15 phút
 *     (P8) — và chốt bảng điểm của cuộc thi đã công bố mà chưa chốt.
 * Quyền của người dùng không phụ thuộc cron: capability luôn kiểm thời gian
 * thật, và bài bị sửa sau hạn đã được trigger chụp bản trước khi sửa.
 *
 * Auth: cùng pattern api/admin/cron/purge-deleted-content/route.ts —
 * `Authorization: Bearer ${CRON_SECRET}` do Vercel Cron tự gắn.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (request.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    console.error("[contests] CRON_SECRET is not set — contests/cron/advance is unauthenticated.");
  }

  try {
    const client = createServiceRoleClient();
    const advance = await advanceDueContests(client);
    // Sau advance: cuộc thi vừa đóng/mở trong lần chạy này cũng được tính.
    const scores = await refreshAllActiveScores(client);
    const errors = [...advance.errors, ...scores.errors];
    if (errors.length) console.error("[contests] cron advance errors:", errors);
    return NextResponse.json({ ...advance, scores, errors }, { status: errors.length ? 207 : 200 });
  } catch (error) {
    console.error("[contests] cron advance failed:", error);
    return NextResponse.json({ error: "Cron cuộc thi thất bại." }, { status: 500 });
  }
}
