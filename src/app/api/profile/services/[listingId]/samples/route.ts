import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";

// Cùng khuôn ALLOWED_MIME_EXT với src/app/api/profile/cover/route.ts +
// src/app/api/authoring/books/[bookId]/cover/route.ts — thêm audio cho
// service_type='voice' (2 route kia chỉ nhận ảnh, chưa có tiền lệ audio
// trong repo).
const ALLOWED_MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};
const SAMPLE_MAX_BYTES = 15 * 1024 * 1024; // ảnh minh họa/đoạn audio mẫu, lớn hơn cover 1 chút

/** GET /api/profile/services/:listingId/samples */
export async function GET(_request: Request, { params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await params;
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("service_samples")
    .select("*")
    .eq("listing_id", listingId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[services] samples list failed:", error);
    return NextResponse.json({ error: "Không tải được sample." }, { status: 500 });
  }
  return NextResponse.json({ samples: data ?? [] });
}

/** POST /api/profile/services/:listingId/samples — tải file mẫu lên
 * (bucket theo đúng service_type: illustration -> design-images, voice ->
 * audio-narrations; ghostwriting KHÔNG upload — chỉ dùng sample "auto" từ
 * chính tác phẩm của seller, xem fetchAutoSamples()). */
export async function POST(request: Request, { params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await params;
  const supabase = createServiceRoleClient();
  const userId = await getAuthedUserId(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: listing } = await supabase
    .from("service_listings")
    .select("id, seller_id, service_type")
    .eq("id", listingId)
    .maybeSingle();
  if (!listing || listing.seller_id !== userId) {
    return NextResponse.json({ error: "Không tìm thấy dịch vụ." }, { status: 404 });
  }
  if (listing.service_type === "ghostwriting") {
    return NextResponse.json({ error: "Dịch vụ viết thuê không tải sample lên — dùng tác phẩm tự đứng tên có sẵn." }, { status: 400 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Thiếu file." }, { status: 400 });
  }
  const ext = ALLOWED_MIME_EXT[file.type];
  if (!ext) {
    return NextResponse.json({ error: "Định dạng không hỗ trợ." }, { status: 400 });
  }
  if (file.size > SAMPLE_MAX_BYTES) {
    return NextResponse.json({ error: "File tối đa 15MB." }, { status: 400 });
  }

  const bucket = listing.service_type === "voice" ? "audio-narrations" : "design-images";
  const path = `${userId}/service-sample-${listingId}-${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type });
  if (uploadError) {
    console.error("[services] sample upload failed:", uploadError);
    return NextResponse.json({ error: "Tải file thất bại." }, { status: 500 });
  }

  const { data: sample, error } = await supabase
    .from("service_samples")
    .insert({ listing_id: listingId, source: "upload", file_url: path })
    .select("*")
    .single();
  if (error || !sample) {
    console.error("[services] sample insert failed:", error);
    return NextResponse.json({ error: "Không lưu được sample." }, { status: 500 });
  }

  return NextResponse.json({ sample });
}
