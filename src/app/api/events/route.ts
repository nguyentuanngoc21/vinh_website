import { getRequestContext, requestError } from "@/lib/mobile/request-context";
import { parseEventInput } from "@/lib/events/input";
import { validateEventBanner } from "@/lib/events/banner-upload";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const { client, userId } = await getRequestContext(request);
    if (!userId) return Response.json({ error: "Vui lòng đăng nhập để tạo sự kiện." }, { status: 401 });
    if (!checkRateLimit(`events:create:${userId}`, 20, 3600000)) return Response.json({ error: "Bạn đã tạo nhiều sự kiện. Vui lòng thử lại sau." }, { status: 429 });
    const parsed = parseEventInput(await request.json().catch(() => null));
    if ("error" in parsed) return Response.json(parsed, { status: 400 });
    const bannerError = await validateEventBanner(client, userId, parsed.data.banner_path);
    if (bannerError) return Response.json({ error: bannerError }, { status: 400 });
    const { data, error } = await client.from("community_events").insert({ ...parsed.data, id: crypto.randomUUID(), organizer_id: userId }).select("id").single();
    if (error) { console.error("[events] create", error); return Response.json({ error: "Không lưu được sự kiện. Vui lòng thử lại." }, { status: 500 }); }
    return Response.json(data, { status: 201 });
  } catch (error) { return requestError(error); }
}
