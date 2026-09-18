import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { CharacterRole } from "@/lib/supabase/types";

const ROLES: CharacterRole[] = ["hero", "villain", "neutral"];
const MAX_NAME_LENGTH = 60;
const MAX_TROPE_LENGTH = 40;

function isCharacterRole(value: unknown): value is CharacterRole {
  return typeof value === "string" && (ROLES as string[]).includes(value);
}

/** PATCH /api/authoring/books/:bookId/characters/:characterId — sửa tên/
 * vai trò/trope. RLS "authors manage characters in their own books" chặn
 * sửa nhân vật của sách người khác — `.update()` trả 0 dòng, xử lý ở
 * nhánh `!data`. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ bookId: string; characterId: string }> }
) {
  const { bookId, characterId } = await params;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
  }

  const update: { name?: string; role?: CharacterRole; trope?: string | null } = {};
  if (typeof body.name === "string" && body.name.trim()) {
    update.name = body.name.trim().slice(0, MAX_NAME_LENGTH);
  }
  if (isCharacterRole(body.role)) {
    update.role = body.role;
  }
  if (typeof body.trope === "string" || body.trope === null) {
    const trimmed = typeof body.trope === "string" ? body.trope.trim().slice(0, MAX_TROPE_LENGTH) : "";
    update.trope = trimmed || null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Không có gì để cập nhật." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("characters")
    .update(update)
    .eq("id", characterId)
    .eq("book_id", bookId)
    .select("id, name, role, trope")
    .maybeSingle();

  if (error) {
    console.error("[characters] update failed:", error);
    return NextResponse.json({ error: "Lưu thất bại. Vui lòng thử lại." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: "Không tìm thấy nhân vật hoặc bạn không có quyền sửa." },
      { status: 404 }
    );
  }

  return NextResponse.json({ character: data });
}

/** DELETE /api/authoring/books/:bookId/characters/:characterId — xoá hẳn
 * (không soft-delete — nhân vật không mang giao dịch/lịch sử tài chính
 * nào cần bảo toàn, khác books/chapters). Xoá cascade luôn
 * chapter_characters/character_follows/character_trope_votes liên quan
 * (on delete cascade, xem migration). */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ bookId: string; characterId: string }> }
) {
  const { bookId, characterId } = await params;
  const supabase = await createClient();

  const { error, count } = await supabase
    .from("characters")
    .delete({ count: "exact" })
    .eq("id", characterId)
    .eq("book_id", bookId);

  if (error) {
    console.error("[characters] delete failed:", error);
    return NextResponse.json({ error: "Xoá thất bại. Vui lòng thử lại." }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json(
      { error: "Không tìm thấy nhân vật hoặc bạn không có quyền xoá." },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true });
}
