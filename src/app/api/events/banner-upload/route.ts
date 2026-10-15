import { getRequestContext, requestError } from "@/lib/mobile/request-context";
import { EVENT_BANNER_MAX_BYTES, EVENT_IMAGE_TYPES } from "@/lib/events/input";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const { client, userId } = await getRequestContext(request);
    if (!userId) return Response.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    if (!checkRateLimit(`events:banner:${userId}`, 40, 3600000)) return Response.json({ error: "Bạn đã tải nhiều ảnh. Vui lòng thử lại sau." }, { status: 429 });
    const body = await request.json().catch(() => null);
    const ext = typeof body?.contentType === "string" ? EVENT_IMAGE_TYPES[body.contentType] : null;
    if (!ext || !Number.isSafeInteger(body?.size) || body.size <= 0 || body.size > EVENT_BANNER_MAX_BYTES) return Response.json({ error: "Chỉ nhận JPG, PNG, WebP tối đa 10 MB." }, { status: 400 });
    const path = `${userId}/event-${crypto.randomUUID()}.${ext}`;
    const { data, error } = await client.storage.from("event-banners").createSignedUploadUrl(path);
    if (error || !data) return Response.json({ error: "Không tạo được liên kết tải ảnh." }, { status: 500 });
    return Response.json({ path: data.path, token: data.token });
  } catch (error) { return requestError(error); }
}
