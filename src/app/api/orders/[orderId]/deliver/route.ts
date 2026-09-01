import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";
import { OrderService } from "@/lib/orders/order-service";
import { applyIllustrationWatermark } from "@/lib/orders/watermark";

const IMAGE_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const AUDIO_EXT: Record<string, string> = { "audio/mpeg": "mp3", "audio/wav": "wav" };
const DELIVER_MAX_BYTES = 30 * 1024 * 1024;

/**
 * POST /api/orders/:orderId/deliver — "Đánh dấu đã bàn giao" (seller).
 * Bàn giao CHI TIẾT theo loại hình (Mục 4 đặc tả):
 * - illustration: watermark tên/ID buyer + XMP "không cho AI học" (sharp,
 *   xem src/lib/orders/watermark.ts), lưu bản watermark + bản gốc riêng
 *   vào bucket private `order-deliverables`.
 * - voice: lưu file gốc vào bucket riêng, phát qua signed URL ngắn hạn
 *   (GET .../asset) — KHÔNG dùng bucket audio-narrations công khai hiện
 *   có, tránh lộ URL tải trực tiếp vĩnh viễn.
 * - ghostwriting: không cần file — quyền xem đã cấp từ trước qua
 *   attach_order_book()/manuscript_access_grants, chỉ cần chuyển status.
 */
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: order } = await supabase
    .from("orders")
    .select("id, code, seller_id, buyer_id, listing_id, service_listings(service_type)")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.seller_id !== userId) {
    return NextResponse.json({ error: "Không tìm thấy đơn hàng." }, { status: 404 });
  }
  const serviceType = (order.service_listings as unknown as { service_type: string } | null)?.service_type;

  const assetPayload: Record<string, unknown> = {};

  if (serviceType === "illustration" || serviceType === "voice") {
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Thiếu file bàn giao." }, { status: 400 });
    }
    if (file.size > DELIVER_MAX_BYTES) {
      return NextResponse.json({ error: "File tối đa 30MB." }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());

    const { data: buyer } = await supabase.from("profiles").select("nickname, username").eq("id", order.buyer_id).maybeSingle();
    const buyerLabel = buyer ? `${buyer.nickname} · @${buyer.username}` : order.buyer_id;

    if (serviceType === "illustration") {
      if (!IMAGE_EXT[file.type]) {
        return NextResponse.json({ error: "Chỉ nhận ảnh JPG, PNG hoặc WEBP." }, { status: 400 });
      }
      let watermarked: Buffer;
      try {
        watermarked = await applyIllustrationWatermark(buf, { buyerLabel, orderCode: order.code });
      } catch (err) {
        console.error("[orders] watermark failed:", err);
        return NextResponse.json({ error: "Xử lý ảnh thất bại." }, { status: 500 });
      }
      const originalPath = `${orderId}/illustration_original-${Date.now()}.${IMAGE_EXT[file.type]}`;
      const previewPath = `${orderId}/illustration_preview-${Date.now()}.png`;
      const [{ error: e1 }, { error: e2 }] = await Promise.all([
        supabase.storage.from("order-deliverables").upload(originalPath, buf, { contentType: file.type }),
        supabase.storage.from("order-deliverables").upload(previewPath, watermarked, { contentType: "image/png" }),
      ]);
      if (e1 || e2) {
        console.error("[orders] deliverable upload failed:", e1 || e2);
        return NextResponse.json({ error: "Tải file thất bại." }, { status: 500 });
      }
      await supabase.from("order_delivered_assets").insert([
        { order_id: orderId, kind: "illustration_original", storage_path: originalPath },
        { order_id: orderId, kind: "illustration_preview", storage_path: previewPath },
      ]);
      assetPayload.previewPath = previewPath;
    } else {
      if (!AUDIO_EXT[file.type]) {
        return NextResponse.json({ error: "Chỉ nhận audio MP3 hoặc WAV." }, { status: 400 });
      }
      const path = `${orderId}/voice_original-${Date.now()}.${AUDIO_EXT[file.type]}`;
      const { error: uploadError } = await supabase.storage.from("order-deliverables").upload(path, buf, { contentType: file.type });
      if (uploadError) {
        console.error("[orders] deliverable upload failed:", uploadError);
        return NextResponse.json({ error: "Tải file thất bại." }, { status: 500 });
      }
      await supabase.from("order_delivered_assets").insert({ order_id: orderId, kind: "voice_original", storage_path: path });
      assetPayload.streamPath = path;
    }
  }

  try {
    const updated = await OrderService.deliver(supabase, { orderId, actorId: userId, asset: assetPayload });
    return NextResponse.json({ order: updated });
  } catch (error) {
    console.error("[orders] deliver failed:", error);
    return NextResponse.json({ error: "Không đánh dấu bàn giao được." }, { status: 400 });
  }
}
