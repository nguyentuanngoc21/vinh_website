import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { AuthorNameAgreementService } from "@/lib/orders/author-name-agreement-service";
import { getOrderForActor } from "@/lib/orders/order-service";

/** GET /api/orders/:orderId/author-name-agreement — thỏa thuận hiện có
 * (nếu có) của Order ghostwriting này. */
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

  const { data: agreement } = await supabase
    .from("author_name_agreements")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();

  return NextResponse.json({ agreement: agreement ?? null });
}

/**
 * POST /api/orders/:orderId/author-name-agreement — khởi tạo thỏa thuận
 * (bên khởi tạo tự xác nhận phần mình ngay). CHỈ dùng SAU khi đơn đã
 * delivered/completed (Mục 5: "chỉ xuất hiện sau khi Order đã ở giai đoạn
 * hoàn thiện/thỏa thuận quyền, là một bước riêng").
 */
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
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
  if (order.status !== "delivered" && order.status !== "completed") {
    return NextResponse.json({ error: "Chỉ thực hiện được sau khi đơn đã bàn giao." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const choice = body?.choice;
  if (choice !== "customer_name" && choice !== "co_authorship") {
    return NextResponse.json({ error: "Lựa chọn đứng tên không hợp lệ." }, { status: 400 });
  }

  try {
    const agreement = await AuthorNameAgreementService.initiate(supabase, {
      orderId,
      actorId: userId,
      choice,
      ghostwriterSampleVisible: body?.ghostwriterSampleVisible === true,
      customerProfileVisible: body?.customerProfileVisible === true,
    });
    return NextResponse.json({ agreement });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không khởi tạo được thỏa thuận.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
