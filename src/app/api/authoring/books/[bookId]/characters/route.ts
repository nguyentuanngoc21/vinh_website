import { NextResponse } from "next/server";
import { getUserContext, requestError } from "@/lib/mobile/request-context";
import type { CharacterRole } from "@/lib/supabase/types";

const ROLES: CharacterRole[] = ["hero", "villain", "neutral"];
const MAX_NAME_LENGTH = 60;
const MAX_TROPE_LENGTH = 40;

function isCharacterRole(value: unknown): value is CharacterRole {
  return typeof value === "string" && (ROLES as string[]).includes(value);
}

/**
 * POST /api/authoring/books/:bookId/characters — tạo 1 nhân vật cho sách
 * của chính tác giả (không phải chỉ để mở khoá quest — công cụ quản lý
 * nhân vật thật, xem migrations/20260919_add_characters.sql). Không tự
 * check ownership tay — policy "authors manage characters in their own
 * books" đã chặn qua RLS, INSERT vi phạm sẽ trả lỗi (xử lý ở nhánh
 * `error` dưới), cùng cách các route authoring khác trong repo.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const { bookId } = await params;
  const body = await request.json().catch(() => null);

  const name = typeof body?.name === "string" ? body.name.trim().slice(0, MAX_NAME_LENGTH) : "";
  if (!name) {
    return NextResponse.json({ error: "Thiếu tên nhân vật." }, { status: 400 });
  }
  const role: CharacterRole = isCharacterRole(body?.role) ? body.role : "neutral";
  const tropeRaw = typeof body?.trope === "string" ? body.trope.trim().slice(0, MAX_TROPE_LENGTH) : "";
  const trope = tropeRaw || null;

  let auth;
  try {
    auth = await getUserContext(request);
  } catch (e) {
    return requestError(e);
  }
  const { supabase, userId } = auth;
  if (!userId) {
    return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
  }
  const { data, error } = await supabase
    .from("characters")
    .insert({ book_id: bookId, name, role, trope })
    .select("id, name, role, trope")
    .single();

  if (error || !data) {
    console.error("[characters] insert failed:", error);
    return NextResponse.json(
      { error: "Không tạo được nhân vật — kiểm tra bạn có phải tác giả sách này không." },
      { status: 403 }
    );
  }

  return NextResponse.json({ character: data });
}
