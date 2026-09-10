import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { computeMissingFields } from "@/lib/orders/service-listing-service";
import {
  hasAcceptedCommissionRules,
  COMMISSION_AGREEMENT_ERROR,
  COMMISSION_AGREEMENT_ID,
} from "@/lib/orders/commission-agreement";
import type { Database } from "@/lib/supabase/types";

type ListingRow = Database["public"]["Tables"]["service_listings"]["Row"];

// Chỉ những field này client sửa được qua route — is_accepting_orders
// KHÔNG nằm trong whitelist thô, xử lý riêng bên dưới (validate 11/11
// trước khi cho bật, Mục 2.1 đặc tả).
const EDITABLE_KEYS = [
  "name",
  "scope_description",
  "price_tiers",
  "deposit_pct",
  "delivery_days",
  "revisions_max",
  "tags",
  "default_usage_scope",
  "refund_policy",
  "lost_contact_days",
  "accepted_content",
  "rejected_content",
  "is_private",
  // Mục 12 — ĐỘC LẬP với 11 trường trên/is_accepting_orders, không tham
  // gia computeMissingFields(). Chỉ dùng riêng cho is_accepting_commissions
  // (xử lý bên dưới, giống is_accepting_orders). Xem
  // migrations/20260910_add_service_commission_status.sql.
  "monthly_commission_limit",
] as const;

/**
 * PATCH /api/profile/services/:listingId — sửa 1 hay nhiều trường (kể cả
 * request bật "Nhận đơn" qua `isAcceptingOrders: true`). Validate đủ
 * 11/11 trường TRƯỚC KHI ghi is_accepting_orders=true — không tin riêng
 * UI (Mục 2.1: "validation phía server, không chỉ phía UI"). Nếu không
 * yêu cầu bật/tắt tường minh, tự tắt lại nếu đang bật mà sửa khiến thiếu
 * trường (Mục 2.1, thông báo lý do qua `forcedOff`/`missingFields`).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: current, error: fetchError } = await supabase
    .from("service_listings")
    .select("*")
    .eq("id", listingId)
    .eq("seller_id", userId)
    .maybeSingle();
  if (fetchError || !current) {
    return NextResponse.json({ error: "Không tìm thấy dịch vụ." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const patch: Record<string, unknown> = {};
  for (const key of EDITABLE_KEYS) {
    if (body && Object.prototype.hasOwnProperty.call(body, key)) patch[key] = body[key];
  }
  const requestedAccepting = typeof body?.isAcceptingOrders === "boolean" ? body.isAcceptingOrders : undefined;

  const merged = { ...current, ...patch } as ListingRow;
  let finalAccepting = current.is_accepting_orders;
  let forcedOff = false;
  let missingFields: ReturnType<typeof computeMissingFields> = [];

  if (requestedAccepting === true) {
    missingFields = computeMissingFields(merged);
    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: "Chưa đủ 11 trường bắt buộc — không thể bật Nhận đơn.", missingFields },
        { status: 400 }
      );
    }
    // Xem src/lib/orders/commission-agreement.ts — Bộ quy tắc giao dịch
    // Commission là điều kiện bắt buộc để cung cấp dịch vụ, ngang hàng
    // 11 trường trên nhưng validate riêng vì đây là 1 văn bản pháp lý
    // (agreement_acceptances), không phải field của chính listing.
    if (!(await hasAcceptedCommissionRules(supabase, userId))) {
      return NextResponse.json(
        { error: COMMISSION_AGREEMENT_ERROR, missingAgreementIds: [COMMISSION_AGREEMENT_ID] },
        { status: 403 }
      );
    }
    finalAccepting = true;
  } else if (requestedAccepting === false) {
    finalAccepting = false;
  } else if (current.is_accepting_orders) {
    missingFields = computeMissingFields(merged);
    if (missingFields.length > 0) {
      finalAccepting = false;
      forcedOff = true;
    }
  }

  // Toggle "nhận comm" — ĐỘC LẬP với is_accepting_orders/11 trường trên
  // (đã chốt với admin). Chỉ chặn bật khi CHƯA có hạn mức — tắt luôn cho
  // phép, không cần điều kiện gì.
  const requestedAcceptingCommissions =
    typeof body?.isAcceptingCommissions === "boolean" ? body.isAcceptingCommissions : undefined;
  let finalAcceptingCommissions = current.is_accepting_commissions;
  if (requestedAcceptingCommissions === true) {
    const mergedLimit = merged.monthly_commission_limit;
    if (mergedLimit == null) {
      return NextResponse.json(
        { error: "Vui lòng đặt hạn mức comm/tháng trước khi bật." },
        { status: 400 }
      );
    }
    finalAcceptingCommissions = true;
  } else if (requestedAcceptingCommissions === false) {
    finalAcceptingCommissions = false;
  }

  const { data: updated, error } = await supabase
    .from("service_listings")
    .update({
      ...patch,
      is_accepting_orders: finalAccepting,
      is_accepting_commissions: finalAcceptingCommissions,
      updated_at: new Date().toISOString(),
    })
    .eq("id", listingId)
    .select("*")
    .single();
  if (error || !updated) {
    console.error("[services] update failed:", error);
    return NextResponse.json({ error: "Không lưu được thay đổi." }, { status: 500 });
  }

  return NextResponse.json({ listing: updated, forcedOff, missingFields: forcedOff ? missingFields : undefined });
}

/** DELETE /api/profile/services/:listingId — xoá 1 gói CHƯA có Order nào
 * gắn vào (còn Order tham chiếu thì không cho xoá, tránh mồ côi FK). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { count } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("listing_id", listingId);
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: "Không thể xoá — đã có đơn hàng gắn với dịch vụ này." }, { status: 400 });
  }

  const { error } = await supabase.from("service_listings").delete().eq("id", listingId).eq("seller_id", userId);
  if (error) {
    console.error("[services] delete failed:", error);
    return NextResponse.json({ error: "Không xoá được dịch vụ." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
