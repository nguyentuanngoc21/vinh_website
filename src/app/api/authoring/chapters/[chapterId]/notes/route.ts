import { NextResponse } from "next/server";
import { getUserContext, requestError } from "@/lib/mobile/request-context";
import { isUuid } from "@/lib/validation/uuid";

const MAX_CHAPTER_NOTES = 10_000;
type Context = { params: Promise<{ chapterId: string }> };

/** Ghi chú & dàn ý riêng của chương — chỉ tác giả (RLS "authors manage notes on their own chapters"). */
export async function GET(request: Request, { params }: Context) {
  const { chapterId } = await params;
  if (!isUuid(chapterId)) return NextResponse.json({ error: "Chương không hợp lệ." }, { status: 400 });
  let auth;
  try { auth = await getUserContext(request); } catch (e) { return requestError(e); }
  if (!auth.userId) return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
  const { data, error } = await auth.supabase.from("chapter_notes").select("notes, updated_at").eq("chapter_id", chapterId).maybeSingle();
  if (error) return NextResponse.json({ error: "Không tải được ghi chú." }, { status: 500 });
  return NextResponse.json({ notes: data?.notes ?? "", updatedAt: data?.updated_at ?? null }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(request: Request, { params }: Context) {
  const { chapterId } = await params;
  const body = await request.json().catch(() => null);
  if (!isUuid(chapterId) || typeof body?.notes !== "string") return NextResponse.json({ error: "Ghi chú không hợp lệ." }, { status: 400 });
  if (body.notes.length > MAX_CHAPTER_NOTES) return NextResponse.json({ error: `Ghi chú tối đa ${MAX_CHAPTER_NOTES.toLocaleString("vi-VN")} ký tự.` }, { status: 413 });
  let auth;
  try { auth = await getUserContext(request); } catch (e) { return requestError(e); }
  if (!auth.userId) return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
  const updatedAt = new Date().toISOString();
  const { error } = await auth.supabase.from("chapter_notes").upsert({ chapter_id: chapterId, notes: body.notes, updated_at: updatedAt });
  if (error) {
    if (error.code === "42501") return NextResponse.json({ error: "Bạn không có quyền với chương này." }, { status: 403 });
    console.error("[chapter-notes] save failed:", error);
    return NextResponse.json({ error: "Không lưu được ghi chú." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, updatedAt });
}
