import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { AuthorInfoKey } from "./contract-parties";

export type AuthorContractInfo = Record<AuthorInfoKey, string | null>;

/**
 * Gộp toàn bộ field "Bên A" (profiles + identity_verifications +
 * auth.users.email) của 1 user thành 1 object — dùng chung bởi
 * GET /api/profile/contract-info (hiển thị) và POST
 * .../agreements/[id]/accept (kiểm tra đủ thông tin trước khi cho xác
 * nhận, xem accept-agreement.ts) để không lặp lại cùng 3 query ở 2 nơi.
 *
 * Trả về SỐ CCCD ĐẦY ĐỦ (không mask) — luôn gọi với userId của chính
 * người đang đăng nhập (getAuthedUserId), chưa bao giờ dùng để xem hồ sơ
 * người khác.
 */
export async function resolveAuthorContractInfo(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<AuthorContractInfo | null> {
  const [{ data: profile, error }, { data: verification }, { data: userData }] = await Promise.all([
    supabase
      .from("profiles")
      .select("nickname, real_name, phone, date_of_birth, address")
      .eq("id", userId)
      .single(),
    supabase
      .from("identity_verifications")
      .select("cccd_number, cccd_issued_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.auth.admin.getUserById(userId),
  ]);

  if (error || !profile) return null;

  return {
    penName: profile.nickname,
    realName: profile.real_name,
    dateOfBirth: profile.date_of_birth,
    address: profile.address,
    phone: profile.phone,
    email: userData.user?.email ?? null,
    cccdNumber: verification?.cccd_number ?? null,
    cccdIssuedAt: verification?.cccd_issued_at ?? null,
  };
}
