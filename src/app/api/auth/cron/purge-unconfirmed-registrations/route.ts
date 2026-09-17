import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Scheduled via vercel.json — dọn tài khoản đăng ký rồi bỏ ngang, chưa bao
 * giờ xác nhận email (mã/link OTP hết hạn, người dùng không quay lại).
 * Không dọn thì username/CCCD của những tài khoản đó khoá vĩnh viễn — xem
 * precheck trong register/route.ts, vốn coi bất kỳ row `profiles`/
 * `identity_verifications` nào đã tồn tại là "đã dùng", bất kể email đã
 * xác nhận hay chưa.
 *
 * 48h là khoảng đệm AN TOÀN so với "Email OTP Expiration" thật sự đang cấu
 * hình trong Supabase Dashboard → Authentication → Providers → Email (mặc
 * định vài giờ, tối đa 24h) — nếu ngưỡng đó bị chỉnh dài hơn 48h trong
 * dashboard, tăng CUTOFF_HOURS bên dưới theo, không thì sẽ xoá nhầm người
 * vẫn còn kịp bấm xác nhận.
 *
 * Cùng cơ chế Bearer CRON_SECRET với wallet/cron/settle-pending và
 * orders/cron/auto-confirm.
 */
const CUTOFF_HOURS = 48;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    console.error("[auth] CRON_SECRET is not set — purge-unconfirmed-registrations is unauthenticated.");
  }

  const admin = createServiceRoleClient();
  const cutoff = new Date(Date.now() - CUTOFF_HOURS * 60 * 60 * 1000).toISOString();

  const { data: staleUserIds, error } = await admin.rpc("find_stale_unconfirmed_user_ids", {
    p_cutoff: cutoff,
    p_limit: 500,
  });
  if (error) {
    console.error("[auth] purge-unconfirmed-registrations scan failed:", error);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }

  let deleted = 0;
  for (const userId of staleUserIds ?? []) {
    // profiles/identity_verifications cascade tự xoá theo "on delete
    // cascade" (docs/supabase/schema.sql) — không cần dọn tay từng bảng.
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      // 1 tài khoản lỗi không được chặn cả batch — giống auto-confirm bỏ
      // qua entry lỗi thay vì abort, log để soát lại thủ công.
      console.error(`[auth] purge-unconfirmed-registrations failed for user ${userId}:`, deleteError);
      continue;
    }
    deleted += 1;
  }

  return NextResponse.json({ deletedCount: deleted });
}
