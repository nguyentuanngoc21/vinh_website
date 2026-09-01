import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { getOrderForActor } from "@/lib/orders/order-service";

const SIGNED_URL_TTL_SECONDS = 15 * 60; // 15 phút — đủ để xem/nghe 1 lượt, không phải link vĩnh viễn

/**
 * GET /api/orders/:orderId/asset — link xem trước (illustration_preview,
 * đã watermark) hoặc nghe (voice_original, phát qua signed URL ngắn hạn —
 * Mục 4.2: "không expose URL file tải trực tiếp"). Sinh MỚI mỗi lần gọi,
 * không cache URL cũ — hết hạn ${SIGNED_URL_TTL_SECONDS}s.
 */
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

  const { data: assets } = await supabase
    .from("order_delivered_assets")
    .select("kind, storage_path")
    .eq("order_id", orderId)
    .in("kind", ["illustration_preview", "voice_original"])
    .order("created_at", { ascending: false });

  const signed = await Promise.all(
    (assets ?? []).map(async (a) => {
      const { data } = await supabase.storage.from("order-deliverables").createSignedUrl(a.storage_path, SIGNED_URL_TTL_SECONDS);
      return { kind: a.kind, url: data?.signedUrl ?? null };
    })
  );

  return NextResponse.json({ assets: signed.filter((a) => a.url) });
}
