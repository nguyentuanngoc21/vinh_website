import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedAdminId } from "@/lib/wallet/session";
import { isUuid } from "@/lib/validation/uuid";
import { normalizeAgeRating } from "@/lib/age-rating";
import { revalidatePublicBooks } from "@/lib/cache/public-data";

const MAX_REASON = 500;

/**
 * GET /api/admin/books/:bookId/age-rating — nhãn hiện tại + lịch sử (mới
 * nhất trước) từ book_age_rating_events (trigger ghi, xem
 * migrations/20261002_book_age_ratings.sql).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  if (!isUuid(bookId)) return NextResponse.json({ error: "Truyện không hợp lệ." }, { status: 400 });
  const supabase = createServiceRoleClient();
  const adminId = await getAuthedAdminId(supabase);
  if (!adminId) {
    return NextResponse.json({ error: "Bạn không có quyền thực hiện thao tác này." }, { status: 401 });
  }

  const [{ data: book, error: bookError }, { data: events, error: eventsError }] = await Promise.all([
    supabase
      .from("books")
      .select("id, age_rating, content_warnings, age_rating_locked_at, age_rating_locked_by")
      .eq("id", bookId)
      .maybeSingle(),
    supabase
      .from("book_age_rating_events")
      .select("id, from_rating, to_rating, from_warnings, to_warnings, locked, actor_id, actor_kind, reason, created_at")
      .eq("book_id", bookId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (bookError || eventsError) {
    console.error("[admin] age rating load failed:", bookError ?? eventsError);
    return NextResponse.json({ error: "Không tải được nhãn độ tuổi." }, { status: 500 });
  }
  if (!book) return NextResponse.json({ error: "Không tìm thấy truyện." }, { status: 404 });

  const actorIds = [
    ...new Set(
      [...(events ?? []).map((e) => e.actor_id), book.age_rating_locked_by].filter((id): id is string => Boolean(id))
    ),
  ];
  const { data: actors } = actorIds.length
    ? await supabase.from("profiles").select("id, username").in("id", actorIds)
    : { data: [] as { id: string; username: string }[] };
  const usernameById = new Map((actors ?? []).map((a) => [a.id, a.username]));

  return NextResponse.json({
    ageRating: book.age_rating,
    contentWarnings: book.content_warnings,
    lockedAt: book.age_rating_locked_at,
    lockedByUsername: book.age_rating_locked_by ? (usernameById.get(book.age_rating_locked_by) ?? null) : null,
    events: (events ?? []).map((e) => ({
      id: e.id,
      fromRating: e.from_rating,
      toRating: e.to_rating,
      fromWarnings: e.from_warnings,
      toWarnings: e.to_warnings,
      locked: e.locked,
      actorKind: e.actor_kind,
      actorUsername: e.actor_id ? (usernameById.get(e.actor_id) ?? null) : null,
      reason: e.reason,
      createdAt: e.created_at,
    })),
  });
}

/**
 * PUT /api/admin/books/:bookId/age-rating — admin/super_admin đặt nhãn
 * { ageRating, contentWarnings, reason, lock }. Bắt buộc lý do. lock=true:
 * tác giả không tự sửa được nữa; false: mở khoá. Ai/khi nào/lý do được
 * trigger ghi vào book_age_rating_events qua RPC admin_set_book_age_rating.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  if (!isUuid(bookId)) return NextResponse.json({ error: "Truyện không hợp lệ." }, { status: 400 });
  const supabase = createServiceRoleClient();
  const adminId = await getAuthedAdminId(supabase);
  if (!adminId) {
    return NextResponse.json({ error: "Bạn không có quyền thực hiện thao tác này." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const rating = normalizeAgeRating(body?.ageRating, body?.contentWarnings);
  if (!rating) return NextResponse.json({ error: "Nhãn độ tuổi không hợp lệ." }, { status: 400 });
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!reason) return NextResponse.json({ error: "Vui lòng nhập lý do." }, { status: 400 });
  if (reason.length > MAX_REASON) {
    return NextResponse.json({ error: `Lý do tối đa ${MAX_REASON} ký tự.` }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("admin_set_book_age_rating", {
    p_book_id: bookId,
    p_admin_id: adminId,
    p_rating: rating.ageRating,
    p_warnings: rating.contentWarnings,
    p_reason: reason,
    p_lock: body?.lock !== false,
  });
  if (error) {
    console.error("[admin] set age rating failed:", error);
    return NextResponse.json({ error: "Không lưu được nhãn độ tuổi." }, { status: 500 });
  }
  if (!data?.id) return NextResponse.json({ error: "Không tìm thấy truyện." }, { status: 404 });

  revalidatePublicBooks();
  return NextResponse.json({
    ageRating: data.age_rating,
    contentWarnings: data.content_warnings,
    locked: data.age_rating_locked_at !== null,
  });
}
