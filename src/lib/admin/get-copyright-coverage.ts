import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type CopyrightCoverage = {
  designProtectedCount: number;
  designTotalCount: number;
  audioProtectedCount: number;
  audioTotalCount: number;
};

/** % bảo hộ thật cho admin/copyright-panel.tsx — thay cho "Độ phủ
 * watermark: 98,2%" bịa trước đây (không có bảng nào đứng sau số đó).
 * Đếm bằng `{ count: "exact", head: true }` — đúng convention đang dùng
 * ở các nơi khác trong repo (vd src/lib/wallet/withdrawal-service.ts),
 * không tải dữ liệu, chỉ lấy số dòng. */
export async function getCopyrightCoverage(
  supabase: SupabaseClient<Database>
): Promise<CopyrightCoverage> {
  const [designTotal, designProtected, audioTotal, audioProtected] = await Promise.all([
    supabase.from("design_items").select("id", { count: "exact", head: true }),
    supabase
      .from("content_protection_status")
      .select("id", { count: "exact", head: true })
      .eq("content_type", "design"),
    supabase.from("audio_narrations").select("id", { count: "exact", head: true }),
    supabase
      .from("content_protection_status")
      .select("id", { count: "exact", head: true })
      .eq("content_type", "audio"),
  ]);

  return {
    designProtectedCount: designProtected.count ?? 0,
    designTotalCount: designTotal.count ?? 0,
    audioProtectedCount: audioProtected.count ?? 0,
    audioTotalCount: audioTotal.count ?? 0,
  };
}
