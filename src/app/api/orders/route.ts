import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { OrderService } from "@/lib/orders/order-service";

/**
 * GET /api/orders?withUserId=:id — mọi đơn giữa mình và :id (2 chiều —
 * mình có thể là buyer hoặc seller), mới nhất trước. Dùng bởi chat-tab.tsx
 * để hiển thị "thẻ đơn hàng" gắn với đúng hội thoại đang mở — không có
 * bảng conversations riêng, cặp (buyer_id, seller_id) của Order CHÍNH LÀ
 * hội thoại (đúng triết lý "không thêm bảng" đã dùng cho direct_messages/
 * author_follows, xem migrations/20260901_add_order_system_core.sql).
 */
export async function GET(request: Request) {
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const withUserId = new URL(request.url).searchParams.get("withUserId");
  if (!withUserId) {
    return NextResponse.json({ error: "Thiếu withUserId." }, { status: 400 });
  }

  const { data: orders, error } = await supabase
    .from("orders")
    .select("*, service_listings(name, service_type)")
    .or(
      `and(buyer_id.eq.${userId},seller_id.eq.${withUserId}),and(buyer_id.eq.${withUserId},seller_id.eq.${userId})`
    )
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[orders] list failed:", error);
    return NextResponse.json({ error: "Không tải được đơn hàng." }, { status: 500 });
  }

  return NextResponse.json({ orders: orders ?? [] });
}

/**
 * POST /api/orders — "Bắt đầu giao dịch" (Mục 3.2 đặc tả). Chốt giá/cọc/
 * số lần sửa từ đúng listing tại thời điểm này (không tin số client gửi
 * lên), và chụp lại (snapshot) các điều khoản seller đang khai trên
 * listing vào `tos_snapshot` — vì seller có thể sửa listing sau, đơn cũ
 * không được đổi theo.
 */
export async function POST(request: Request) {
  const supabase = createServiceRoleClient();
  const buyerId = await getAuthedUserId(supabase);
  if (!buyerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const listingId = typeof body?.listingId === "string" ? body.listingId : null;
  const priceTierIndex = Number.isInteger(body?.priceTierIndex) ? Number(body.priceTierIndex) : 0;
  if (!listingId) {
    return NextResponse.json({ error: "Thiếu listingId." }, { status: 400 });
  }

  const { data: listing, error: listingError } = await supabase
    .from("service_listings")
    .select("*")
    .eq("id", listingId)
    .maybeSingle();
  if (listingError || !listing) {
    return NextResponse.json({ error: "Không tìm thấy dịch vụ." }, { status: 404 });
  }
  if (!listing.is_accepting_orders) {
    return NextResponse.json({ error: "Dịch vụ này hiện không nhận đơn." }, { status: 400 });
  }
  if (listing.seller_id === buyerId) {
    return NextResponse.json({ error: "Không thể đặt dịch vụ của chính mình." }, { status: 400 });
  }

  const tiers = Array.isArray(listing.price_tiers) ? listing.price_tiers : [];
  const tier = tiers[priceTierIndex] as { price?: number } | undefined;
  const price = Number(tier?.price ?? 0);
  if (!Number.isFinite(price) || price <= 0) {
    return NextResponse.json({ error: "Gói giá không hợp lệ." }, { status: 400 });
  }
  const depositPct = listing.deposit_pct ?? 50;
  const revisionsMax = listing.revisions_max ?? 2;

  try {
    const order = await OrderService.createOrder(supabase, {
      buyerId,
      sellerId: listing.seller_id,
      listingId,
      price,
      depositPct,
      revisionsMax,
      tosSnapshot: {
        scope_description: listing.scope_description,
        refund_policy: listing.refund_policy,
        accepted_content: listing.accepted_content,
        rejected_content: listing.rejected_content,
        deposit_pct: depositPct,
        revisions_max: revisionsMax,
        delivery_days: listing.delivery_days,
        lost_contact_days: listing.lost_contact_days,
      },
    });
    return NextResponse.json({ order });
  } catch (error) {
    console.error("[orders] create failed:", error);
    return NextResponse.json({ error: "Không tạo được đơn hàng." }, { status: 500 });
  }
}
