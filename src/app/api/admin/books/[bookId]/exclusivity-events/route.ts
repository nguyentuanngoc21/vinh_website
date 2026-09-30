import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedAdminId } from "@/lib/wallet/session";

/**
 * GET /api/admin/books/:bookId/exclusivity-events — lịch sử độc quyền của
 * 1 truyện (mới nhất trước), cho hộp xác nhận ở content-table.tsx. Nguồn:
 * book_exclusivity_events (trigger ghi) — xem
 * migrations/20260930_book_exclusivity_default_and_history.sql. Không có
 * dữ liệu cho các lần đổi trước migration đó.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const supabase = createServiceRoleClient();
  const adminId = await getAuthedAdminId(supabase);
  if (!adminId) {
    return NextResponse.json({ error: "Bạn không có quyền thực hiện thao tác này." }, { status: 401 });
  }

  const { data: events, error } = await supabase
    .from("book_exclusivity_events")
    .select("id, from_exclusive, to_exclusive, actor_id, actor_kind, reason, created_at")
    .eq("book_id", bookId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    console.error("[admin] exclusivity events failed:", error);
    return NextResponse.json({ error: "Không tải được lịch sử." }, { status: 500 });
  }

  const actorIds = [...new Set((events ?? []).map((e) => e.actor_id).filter((id): id is string => Boolean(id)))];
  const { data: actors } = actorIds.length
    ? await supabase.from("profiles").select("id, username").in("id", actorIds)
    : { data: [] as { id: string; username: string }[] };
  const usernameById = new Map((actors ?? []).map((a) => [a.id, a.username]));

  return NextResponse.json({
    events: (events ?? []).map((e) => ({
      id: e.id,
      fromExclusive: e.from_exclusive,
      toExclusive: e.to_exclusive,
      actorKind: e.actor_kind,
      actorUsername: e.actor_id ? (usernameById.get(e.actor_id) ?? null) : null,
      reason: e.reason,
      createdAt: e.created_at,
    })),
  });
}
