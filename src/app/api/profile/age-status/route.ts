import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedViewer } from "@/lib/wallet/session";
import { isAdminRole } from "@/lib/roles";
import { isAgeVerifiedAdult } from "@/lib/age-rating-access";

/**
 * GET /api/profile/age-status — { canReadAdult } cho CHÍNH người gọi. Chỉ để
 * giao diện bỏ làm mờ bìa truyện 18+ ở danh sách (useCanReadAdult); quyền đọc
 * thật vẫn kiểm ở server (resolveAgeGate + RLS chapters).
 */
export async function GET() {
  const service = createServiceRoleClient();
  const viewer = await getAuthedViewer(service);
  if (!viewer) return NextResponse.json({ canReadAdult: false });
  const canReadAdult = isAdminRole(viewer.role) || (await isAgeVerifiedAdult(service, viewer.id));
  return NextResponse.json({ canReadAdult }, { headers: { "Cache-Control": "private, no-store" } });
}
