import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedAdminId } from "@/lib/wallet/session";
import { UUID } from "@/lib/events/input";
import { EVENT_GAME_DEFINITIONS } from "@/lib/events/game-definitions";
import type { Database } from "@/lib/supabase/types";
export async function PATCH(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const client = createServiceRoleClient();
  if (!await getAuthedAdminId(client)) return Response.json({ error: "Bạn không có quyền quản lý sự kiện." }, { status: 403 });
  const { eventId } = await params;
  if (!UUID.test(eventId)) return Response.json({ error: "Không tìm thấy sự kiện." }, { status: 404 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  const patch: Database["public"]["Tables"]["community_events"]["Update"] = { updated_at: new Date().toISOString() };
  if ("hidden" in body) {
    if (typeof body.hidden !== "boolean") return Response.json({ error: "Trạng thái ẩn không hợp lệ." }, { status: 400 });
    patch.hidden = body.hidden;
  }
  if ("gameIds" in body) {
    if (!Array.isArray(body.gameIds) || body.gameIds.length > 20 || !body.gameIds.every((id: unknown) => typeof id === "string" && EVENT_GAME_DEFINITIONS.some((game) => game.id === id))) return Response.json({ error: "Chỉ được chọn trò chơi đã đăng ký trong Vịnh." }, { status: 400 });
    patch.games = [...new Set<string>(body.gameIds)].map((id) => EVENT_GAME_DEFINITIONS.find((game) => game.id === id)!);
  }
  if (!("hidden" in patch) && !("games" in patch)) return Response.json({ error: "Chưa chọn thay đổi." }, { status: 400 });
  const { data, error } = await client.from("community_events").update(patch).eq("id", eventId).select("id").maybeSingle();
  if (error) { console.error("[admin/events] update", error); return Response.json({ error: "Không cập nhật được sự kiện." }, { status: 500 }); }
  return data ? Response.json(data) : Response.json({ error: "Không tìm thấy sự kiện." }, { status: 404 });
}
