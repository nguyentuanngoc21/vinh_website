import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { BookGenre } from "@/lib/supabase/types";

const VALID_GENRES: readonly BookGenre[] = [
  "Ngôn tình",
  "Trinh thám",
  "Tản văn",
  "Văn học",
  "Lịch sử",
  "Kỳ ảo",
  "Kinh dị",
  "Phiêu lưu",
];

function isBookGenre(value: unknown): value is BookGenre {
  return typeof value === "string" && (VALID_GENRES as readonly string[]).includes(value);
}

/**
 * PATCH /api/authoring/books/:bookId — sửa title/genre của 1 sách đã có
 * (dùng bởi GenreSelect trong publish-panel.tsx để đổi thể loại sau khi
 * tạo). Không tự check ownership tay — policy "authors update their own
 * books" (docs/supabase/schema.sql) đã chặn qua RLS; .update() trên hàng
 * không thuộc về mình trả về 0 dòng, xử lý ở nhánh `!data` dưới.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const { bookId } = await params;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
  }

  const update: { title?: string; genre?: BookGenre } = {};
  if (typeof body.title === "string" && body.title.trim()) {
    update.title = body.title.trim();
  }
  if (isBookGenre(body.genre)) {
    update.genre = body.genre;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Không có gì để cập nhật." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("books")
    .update(update)
    .eq("id", bookId)
    .select("id, title, genre")
    .maybeSingle();

  if (error) {
    console.error("[authoring] update book failed:", error);
    return NextResponse.json({ error: "Lưu thất bại. Vui lòng thử lại." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: "Không tìm thấy truyện hoặc bạn không có quyền sửa." },
      { status: 404 }
    );
  }

  return NextResponse.json(data);
}
