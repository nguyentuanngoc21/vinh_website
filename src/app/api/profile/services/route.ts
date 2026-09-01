import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import type { ServiceType } from "@/lib/supabase/types";

const SERVICE_TYPES: ServiceType[] = ["illustration", "voice", "ghostwriting"];

/** GET /api/profile/services — danh sách dịch vụ CỦA CHÍNH MÌNH (tab "Dịch
 * vụ" ở Trang cá nhân). Xem thêm src/app/ket-noi cho việc hiển thị dịch
 * vụ NGƯỜI KHÁC (chỉ những listing is_accepting_orders=true). */
export async function GET() {
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("service_listings")
    .select("*")
    .eq("seller_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[services] list failed:", error);
    return NextResponse.json({ error: "Không tải được danh sách dịch vụ." }, { status: 500 });
  }

  return NextResponse.json({ listings: data ?? [] });
}

/** POST /api/profile/services — "Thêm dịch vụ mới" (bắt đầu ở trạng thái
 * rỗng, is_accepting_orders=false — điền đủ 11 trường rồi mới bật được,
 * xem PATCH /api/profile/services/:listingId). */
export async function POST(request: Request) {
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const serviceType = body?.serviceType as ServiceType;
  if (!SERVICE_TYPES.includes(serviceType)) {
    return NextResponse.json({ error: "Loại dịch vụ không hợp lệ." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("service_listings")
    .insert({ seller_id: userId, service_type: serviceType })
    .select("*")
    .single();
  if (error || !data) {
    console.error("[services] create failed:", error);
    return NextResponse.json({ error: "Không tạo được dịch vụ." }, { status: 500 });
  }

  return NextResponse.json({ listing: data });
}
