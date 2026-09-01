import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import type { ServiceType } from "@/lib/supabase/types";

const SERVICE_TYPES: ServiceType[] = ["illustration", "voice", "ghostwriting"];

/** POST /api/profile/services/tag-suggestions — "Đề xuất tag mới" (Mục
 * 2.2 đặc tả) — vào hàng đợi duyệt của admin, KHÔNG thêm thẳng vào danh
 * mục chọn được. Duyệt (approve -> ghi vào service_tag_options) là việc
 * của route admin riêng, chưa làm ở phase này. */
export async function POST(request: Request) {
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const serviceType = body?.serviceType as ServiceType;
  const groupKey = typeof body?.groupKey === "string" ? body.groupKey.trim() : "";
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  if (!SERVICE_TYPES.includes(serviceType) || !groupKey || !label) {
    return NextResponse.json({ error: "Thiếu thông tin đề xuất." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("service_tag_suggestions")
    .insert({ submitted_by: userId, service_type: serviceType, group_key: groupKey, label })
    .select("*")
    .single();
  if (error || !data) {
    console.error("[services] tag suggestion failed:", error);
    return NextResponse.json({ error: "Không gửi được đề xuất." }, { status: 500 });
  }

  return NextResponse.json({ suggestion: data });
}
