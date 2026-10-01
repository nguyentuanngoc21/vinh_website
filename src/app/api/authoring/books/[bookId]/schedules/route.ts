import { NextResponse } from "next/server";
import { getUserContext, requestError } from "@/lib/mobile/request-context";
import { isScheduleRequest } from "@/lib/authoring/publication-schedule";
import { hasAcceptedExclusivityPolicy, EXCLUSIVITY_AGREEMENT_ERROR, EXCLUSIVITY_AGREEMENT_ID } from "@/lib/authoring/exclusivity-agreement";

type Context = { params: Promise<{ bookId: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const { bookId } = await params;
    const { supabase, userId } = await getUserContext(request);
    if (!userId) return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
    const { data, error } = await supabase.from("chapter_publication_schedules").select("*")
      .eq("book_id", bookId).eq("author_id", userId).order("created_at", { ascending: false }).limit(100);
    if (error) return NextResponse.json({ error: "Chưa tải được lịch đăng. Kiểm tra cấu hình hẹn giờ." }, { status: 500 });
    return NextResponse.json({ schedules: data });
  } catch (e) { return requestError(e); }
}

export async function POST(request: Request, { params }: Context) {
  const body: unknown = await request.json().catch(() => null);
  if (!isScheduleRequest(body)) return NextResponse.json({ error: "Dữ liệu hẹn giờ không hợp lệ." }, { status: 400 });
  try {
    const { bookId } = await params;
    const { supabase, userId } = await getUserContext(request);
    if (!userId) return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
    const { data: book } = await supabase.from("books").select("author_id, is_exclusive, deleted_at").eq("id", bookId).maybeSingle();
    if (!book || book.author_id !== userId || book.deleted_at) return NextResponse.json({ error: "Không có quyền hẹn giờ cho truyện này." }, { status: 404 });
    if (book.is_exclusive && !(await hasAcceptedExclusivityPolicy(supabase, userId))) {
      return NextResponse.json({ error: EXCLUSIVITY_AGREEMENT_ERROR, missingAgreementIds: [EXCLUSIVITY_AGREEMENT_ID] }, { status: 403 });
    }
    const { data, error } = await supabase.rpc("schedule_chapter_publication", {
      p_id: body.id, p_book_id: bookId, p_chapter_ids: body.chapterIds, p_starts_at: body.startsAt,
      p_interval_days: body.intervalDays, p_price: body.price ?? null,
    });
    if (error) return NextResponse.json({ error: error.code === "P0001" ? error.message : "Không lưu được lịch đăng. Vui lòng thử lại." }, { status: error.code === "P0001" ? 409 : 500 });
    return NextResponse.json({ scheduleId: data });
  } catch (e) { return requestError(e); }
}

export async function DELETE(request: Request, { params }: Context) {
  const body = await request.json().catch(() => null);
  if (typeof body?.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id)) return NextResponse.json({ error: "Lịch đăng không hợp lệ." }, { status: 400 });
  try {
    const { bookId } = await params;
    const { supabase, userId } = await getUserContext(request);
    if (!userId) return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
    const { data } = await supabase.from("chapter_publication_schedules").select("id")
      .eq("id", body.id).eq("book_id", bookId).eq("author_id", userId).maybeSingle();
    if (!data) return NextResponse.json({ error: "Không tìm thấy lịch đăng." }, { status: 404 });
    const { error } = await supabase.rpc("cancel_chapter_publication", { p_id: data.id });
    if (error) return NextResponse.json({ error: "Lịch đã xử lý hoặc không huỷ được. Hãy tải lại danh sách." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (e) { return requestError(e); }
}
