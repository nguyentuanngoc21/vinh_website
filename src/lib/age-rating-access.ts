import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { AgeRating } from "@/lib/age-rating";
import { isAdminRole } from "@/lib/roles";

type Client = SupabaseClient<Database>;

/**
 * Cổng độ tuổi cho 1 người xem trên 1 truyện (server, service-role client):
 * - "none": đọc bình thường.
 * - "confirm16": truyện 16+ — giao diện hỏi "Tôi đủ 16 tuổi" (chỉ tự xác
 *   nhận, nội dung vẫn được gửi xuống).
 * - "verify18": truyện 18+ mà người xem chưa xác thực đủ 18 tuổi — KHÔNG gửi
 *   nội dung chương. `reason` để hiện đúng lời nhắc: chưa đăng nhập / chưa
 *   xác thực CCCD / đã xác thực nhưng năm sinh trên CCCD chưa đủ 18.
 *
 * Tác giả của truyện và admin luôn "none" (tự đọc truyện mình, kiểm duyệt).
 */
export type AgeGate =
  | { gate: "none" }
  | { gate: "confirm16" }
  | { gate: "verify18"; reason: "guest" | "unverified" | "underage" };

export async function resolveAgeGate(
  service: Client,
  book: { age_rating: AgeRating; author_id: string },
  viewer: { id: string; role: string | null } | null
): Promise<AgeGate> {
  if (book.age_rating === "all") return { gate: "none" };
  if (viewer && (viewer.id === book.author_id || isAdminRole(viewer.role))) return { gate: "none" };
  if (book.age_rating === "16") return { gate: "confirm16" };

  if (!viewer) return { gate: "verify18", reason: "guest" };
  if (await isAgeVerifiedAdult(service, viewer.id)) return { gate: "none" };
  const { data: profile } = await service.from("profiles").select("cccd_verified").eq("id", viewer.id).maybeSingle();
  return { gate: "verify18", reason: profile?.cccd_verified ? "underage" : "unverified" };
}

/** Lỗi RPC coi như CHƯA xác thực — đóng cổng chứ không mở nhầm. */
export async function isAgeVerifiedAdult(service: Client, userId: string): Promise<boolean> {
  const { data, error } = await service.rpc("is_age_verified_adult", { p_user_id: userId });
  if (error) {
    console.error("[age-rating] is_age_verified_adult failed:", error);
    return false;
  }
  return data === true;
}
