import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedAdminId } from "@/lib/wallet/session";

/** GET /api/admin/disputes — hàng đợi tranh chấp đang mở (Mục 9), mới
 * nhất trước. */
export async function GET() {
  const supabase = createServiceRoleClient();
  const adminId = await getAuthedAdminId(supabase);
  if (!adminId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("disputes")
    .select("*, orders(code, buyer_id, seller_id)")
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[admin/disputes] list failed:", error);
    return NextResponse.json({ error: "Không tải được danh sách tranh chấp." }, { status: 500 });
  }

  return NextResponse.json({ disputes: data ?? [] });
}
