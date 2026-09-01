import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";

/** DELETE /api/profile/services/:listingId/samples/:sampleId — gỡ 1
 * sample đã upload (không xoá object trong storage — cùng quyết định đã
 * ghi chú ở profile/cover/route.ts: chưa có luồng dọn storage nào trong
 * repo, không thêm phức tạp ở đây). */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ listingId: string; sampleId: string }> }
) {
  const { listingId, sampleId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: listing } = await supabase
    .from("service_listings")
    .select("id, seller_id")
    .eq("id", listingId)
    .maybeSingle();
  if (!listing || listing.seller_id !== userId) {
    return NextResponse.json({ error: "Không tìm thấy dịch vụ." }, { status: 404 });
  }

  const { error } = await supabase.from("service_samples").delete().eq("id", sampleId).eq("listing_id", listingId);
  if (error) {
    console.error("[services] sample delete failed:", error);
    return NextResponse.json({ error: "Không gỡ được sample." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
