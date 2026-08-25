import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BOOK_GENRES } from "@/lib/covers/genre-styles";
import type { BookGenre } from "@/lib/supabase/types";

function isBookGenre(value: unknown): value is BookGenre {
  return typeof value === "string" && (BOOK_GENRES as readonly string[]).includes(value);
}

const MAX_TAGS = 20; // khớp CHECK books_tags_length_check

function parseTags(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((t) => typeof t === "string")) return null;
  const cleaned = Array.from(new Set(value.map((t) => t.trim()).filter(Boolean)));
  return cleaned.slice(0, MAX_TAGS);
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

  const update: { title?: string; genre?: BookGenre; tags?: string[] } = {};
  if (typeof body.title === "string" && body.title.trim()) {
    update.title = body.title.trim();
  }
  if (isBookGenre(body.genre)) {
    update.genre = body.genre;
  }
  const tags = parseTags(body.tags);
  if (tags) {
    update.tags = tags;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Không có gì để cập nhật." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("books")
    .update(update)
    .eq("id", bookId)
    .select("id, title, genre, tags")
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
