import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedAdminId } from "@/lib/wallet/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { contestErrorResponse, readJson } from "@/lib/contests/route-helpers";
import { CONTEST_IMAGE_BUCKET, CONTEST_IMAGE_MAX_BYTES, CONTEST_IMAGE_TYPES } from "@/lib/contests/image-upload";

export async function POST(request: Request) {
  try {
    const client = createServiceRoleClient();
    const adminId = await getAuthedAdminId(client);
    if (!adminId) return Response.json({ error: "Bạn không có quyền tải ảnh cuộc thi." }, { status: 401 });
    if (!checkRateLimit(`contests:image:${adminId}`, 40, 3600000)) {
      return Response.json({ error: "Bạn đã tải nhiều ảnh. Vui lòng thử lại sau." }, { status: 429 });
    }
    const body = await readJson(request);
    const ext = typeof body.contentType === "string" && Object.hasOwn(CONTEST_IMAGE_TYPES, body.contentType)
      ? CONTEST_IMAGE_TYPES[body.contentType] : null;
    if (!ext || typeof body.size !== "number" || !Number.isSafeInteger(body.size) || body.size <= 0 || body.size > CONTEST_IMAGE_MAX_BYTES) {
      return Response.json({ error: "Chỉ nhận JPG, PNG, WebP tối đa 10 MB." }, { status: 400 });
    }
    const path = `${adminId}/${crypto.randomUUID()}.${ext}`;
    const bucket = client.storage.from(CONTEST_IMAGE_BUCKET);
    const { data, error } = await bucket.createSignedUploadUrl(path);
    if (error || !data) throw error ?? new Error("Missing upload token");
    return Response.json({ path: data.path, token: data.token, url: bucket.getPublicUrl(data.path).data.publicUrl });
  } catch (error) {
    return contestErrorResponse(error, "admin contest image upload");
  }
}
