import { NextResponse } from "next/server";
import { getRequestContext, requestError } from "@/lib/mobile/request-context";

const EXT: Record<string, Record<string, string>> = {
  illustration: { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" },
  voice: { "audio/mpeg": "mp3", "audio/wav": "wav" },
};

/**
 * POST /api/orders/:orderId/deliver/upload-url — bước 1 của bàn giao file
 * lớn: cấp signed upload URL vào thư mục tạm `${orderId}/upload-*` của bucket
 * private `order-deliverables`, để client tải file thẳng lên Storage (bỏ qua
 * giới hạn body ~4.5MB của Vercel). Bước 2 là POST .../deliver với
 * `{ uploadPath }` — watermark/lưu bản chính vẫn làm ở server như cũ.
 * Chỉ seller, chỉ khi đơn đang in_progress, đúng loại file của dịch vụ.
 */
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  let auth;
  try { auth = await getRequestContext(request); } catch (e) { return requestError(e); }
  const { client: supabase, userId } = auth;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: order } = await supabase
    .from("orders")
    .select("id, status, seller_id, service_listings(service_type)")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.seller_id !== userId) {
    return NextResponse.json({ error: "Không tìm thấy đơn hàng." }, { status: 404 });
  }
  if (order.status !== "in_progress") {
    return NextResponse.json({ error: "Chỉ bàn giao được khi đơn đang thực hiện." }, { status: 400 });
  }
  const serviceType = (order.service_listings as unknown as { service_type: string } | null)?.service_type ?? "";
  const body = await request.json().catch(() => null);
  const ext = EXT[serviceType]?.[typeof body?.contentType === "string" ? body.contentType : ""];
  if (!ext) {
    return NextResponse.json(
      { error: serviceType === "voice" ? "Chỉ nhận audio MP3 hoặc WAV." : serviceType === "illustration" ? "Chỉ nhận ảnh JPG, PNG hoặc WEBP." : "Dịch vụ này không cần file bàn giao." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase.storage.from("order-deliverables").createSignedUploadUrl(`${orderId}/upload-${Date.now()}.${ext}`);
  if (error || !data) {
    console.error("[orders] deliver upload url failed:", error);
    return NextResponse.json({ error: "Không tạo được link tải file." }, { status: 500 });
  }
  return NextResponse.json({ path: data.path, token: data.token });
}
