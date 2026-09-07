import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { UserTable, type UserRow } from "@/components/admin/user-table";

export const metadata: Metadata = { title: "Người dùng · Vịnh Admin" };

const FETCH_LIMIT = 200;

/**
 * Trang "Người dùng" ĐẦU TIÊN trong /admin (trước đây chỉ là placeholder
 * "Sắp có" — xem admin-sidebar.tsx). MVP: tìm/liệt kê, xem chi tiết, đổi
 * role, cấp thưởng token (nối UI cho /api/admin/bonus — route đã có sẵn
 * backend nhưng chưa từng có UI nào gọi tới). Khoá/tạm ngưng tài khoản
 * KHÔNG có trong bản này — chưa có cột "banned" chung trong profiles
 * (chỉ có screenshot_penalty_banned riêng cho vi phạm chụp màn hình,
 * không dùng chung được), cần migration riêng nếu muốn thêm sau.
 *
 * Cùng convention với /admin/noi-dung: service-role (cần đọc TẤT CẢ user,
 * không chỉ chính mình), giới hạn 200 dòng mới nhất, tìm kiếm lọc phía
 * CLIENT trong danh sách đã tải.
 */
export default async function AdminUsersPage() {
  const supabase = createServiceRoleClient();

  const { data: rows } = await supabase
    .from("profiles")
    .select("id, username, nickname, role, token_balance, cccd_verified, created_at")
    .order("created_at", { ascending: false })
    .limit(FETCH_LIMIT + 1);

  const truncated = (rows?.length ?? 0) > FETCH_LIMIT;
  const users: UserRow[] = (rows ?? []).slice(0, FETCH_LIMIT).map((r) => ({
    id: r.id,
    username: r.username,
    nickname: r.nickname,
    role: r.role,
    tokenBalance: r.token_balance,
    cccdVerified: r.cccd_verified,
    createdAt: r.created_at,
  }));

  return (
    <>
      <div className="mb-6">
        <h1 className="text-[26px] font-bold text-brand-ink">Người dùng</h1>
        <p className="mt-0.5 text-sm text-stone-alt">
          Tìm kiếm, xem chi tiết, đổi quyền, cấp thưởng token.
        </p>
      </div>
      <UserTable rows={users} truncated={truncated} fetchLimit={FETCH_LIMIT} />
    </>
  );
}
