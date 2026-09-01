import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { OrderService, getOrderForActor } from "@/lib/orders/order-service";

const SIGNED_URL_TTL_SECONDS = 15 * 60;

/** GET /api/orders/:orderId/original-file — link tải file gốc, CHỈ nếu
 * có 1 order_file_requests đã 'agreed' (Mục 3.2/4: "cần cả 2 bên xác nhận
 * mới mở khóa"). */
export async function GET(_request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const order = await getOrderForActor(supabase, orderId, userId);
  if (!order) {
    return NextResponse.json({ error: "Không tìm thấy đơn hàng." }, { status: 404 });
  }

  const { data: agreed } = await supabase
    .from("order_file_requests")
    .select("id")
    .eq("order_id", orderId)
    .eq("status", "agreed")
    .limit(1)
    .maybeSingle();
  if (!agreed) {
    return NextResponse.json({ error: "File gốc chưa được mở khóa — cần cả 2 bên đồng ý." }, { status: 403 });
  }

  const { data: asset } = await supabase
    .from("order_delivered_assets")
    .select("storage_path")
    .eq("order_id", orderId)
    .in("kind", ["illustration_original", "voice_original"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!asset) {
    return NextResponse.json({ error: "Chưa có file gốc nào được bàn giao." }, { status: 404 });
  }

  const { data: signed } = await supabase.storage
    .from("order-deliverables")
    .createSignedUrl(asset.storage_path, SIGNED_URL_TTL_SECONDS, { download: true });

  return NextResponse.json({ url: signed?.signedUrl ?? null });
}

/** POST /api/orders/:orderId/original-file — "Yêu cầu file gốc" (buyer
 * hoặc seller đều gọi được — bên KHÔNG yêu cầu phải là bên đồng ý, xem
 * PATCH). */
export async function POST(_request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const request_ = await OrderService.requestFile(supabase, { orderId, actorId: userId });
    return NextResponse.json({ request: request_ });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không gửi được yêu cầu.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
