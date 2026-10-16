import { getRequestContext, requestError } from "@/lib/mobile/request-context";
import { parseEventInput, UUID } from "@/lib/events/input";
import { validateEventBanner } from "@/lib/events/banner-upload";
import { revalidatePublicEvents } from "@/lib/events/cache";

export async function PATCH(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const { client, userId } = await getRequestContext(request);
    if (!userId) return Response.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
    const { eventId } = await params;
    if (!UUID.test(eventId)) return Response.json({ error: "Không tìm thấy sự kiện." }, { status: 404 });
    const parsed = parseEventInput(await request.json().catch(() => null));
    if ("error" in parsed) return Response.json(parsed, { status: 400 });
    const bannerError = await validateEventBanner(client, userId, parsed.data.banner_path);
    if (bannerError) return Response.json({ error: bannerError }, { status: 400 });
    // Atomic owner/moderation predicates: clients cannot reassign or unhide events.
    const { data, error } = await client.from("community_events").update({ ...parsed.data, updated_at: new Date().toISOString() }).eq("id", eventId).eq("organizer_id", userId).eq("hidden", false).select("id").maybeSingle();
    if (error) { console.error("[events] update", error); return Response.json({ error: "Không lưu được sự kiện." }, { status: 500 }); }
    if (data) revalidatePublicEvents();
    return data ? Response.json(data) : Response.json({ error: "Bạn không có quyền sửa sự kiện này hoặc sự kiện đã bị quản trị viên ẩn." }, { status: 403 });
  } catch (error) { return requestError(error); }
}
