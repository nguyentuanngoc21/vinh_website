import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Trước bản vá này, route chỉ xoá cookie `vinh_session` (tự ký) — KHÔNG
 * gọi supabase.auth.signOut(), nên cookie phiên Supabase Auth thật (do
 * /api/auth/login set song song qua supabase.auth.signInWithPassword(),
 * xem createClient() ở src/lib/supabase/server.ts) vẫn còn sống. Hệ quả:
 * getAuthedUserId() (src/lib/wallet/session.ts) thử `vinh_session` trước,
 * thấy rỗng thì rơi xuống nhánh dự phòng supabase.auth.getUser() — và
 * nhánh đó VẪN nhận ra người dùng vì cookie Supabase chưa bị xoá. Kết quả
 * thực tế: bấm "Đăng xuất" xong, mọi route/trang dựa vào getAuthedUserId()
 * (rào đọc/nghe cho khách, ví, vote, follow, admin check...) vẫn coi người
 * đó là ĐÃ đăng nhập cho tới khi cookie Supabase tự hết hạn hoặc trình
 * duyệt bị xoá cookie thủ công — không phải lỗi cache, không phải lỗi
 * riêng của 1 tính năng nào, mà là logout chưa triệt để ở tầng gốc.
 *
 * signOut() gọi trên `createClient()` (SSR cookie-aware client) — Route
 * Handler (khác Server Component) được phép ghi cookie thật, nên cookie
 * Supabase Auth bị xoá đúng cách trên response trả về.
 */
export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return clearSessionCookie(NextResponse.json({ ok: true }));
}
