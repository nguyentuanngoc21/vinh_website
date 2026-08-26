import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BOOK_GENRES } from "@/lib/covers/genre-styles";
import { isExclusivityLocked } from "@/lib/authoring/exclusivity-lock";
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
 * PATCH /api/authoring/books/:bookId — sửa title/genre/tags/is_exclusive
 * của 1 sách đã có (dùng bởi GenreSelect + toggle độc quyền trong
 * publish-panel.tsx). Không tự check ownership tay — policy "authors
 * update their own books" (docs/supabase/schema.sql) đã chặn qua RLS;
 * .update() trên hàng không thuộc về mình trả về 0 dòng, xử lý ở nhánh
 * `!data` dưới.
 *
 * is_exclusive: true -> false bị khoá nếu sách đã published QUÁ 3 NGÀY
 * (published_at + 3 ngày < now) và đang exclusive — xem
 * migrations/20260826_add_book_exclusivity.sql. Route admin riêng
 * (src/app/api/admin/books/[bookId]/route.ts) bỏ qua luật này hoàn toàn.
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

  const update: { title?: string; genre?: BookGenre; tags?: string[]; is_exclusive?: boolean } = {};
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

  const supabase = await createClient();

  if (typeof body.is_exclusive === "boolean") {
    if (body.is_exclusive === false) {
      // Chỉ cần đọc trước khi chuyển true -> false — chuyển false -> true
      // luôn được phép, không cần fetch gì cả.
      const { data: current } = await supabase
        .from("books")
        .select("published, is_exclusive, published_at")
        .eq("id", bookId)
        .maybeSingle();

      if (
        current &&
        isExclusivityLocked({
          isExclusive: current.is_exclusive,
          published: current.published,
          publishedAt: current.published_at,
        })
      ) {
        return NextResponse.json(
          {
            error:
              "Không thể chuyển tác phẩm đã độc quyền quá 3 ngày kể từ lúc xuất bản về tự do.",
          },
          { status: 403 }
        );
      }
    }
    update.is_exclusive = body.is_exclusive;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Không có gì để cập nhật." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("books")
    .update(update)
    .eq("id", bookId)
    .select("id, title, genre, tags, is_exclusive")
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

/**
 * DELETE /api/authoring/books/:bookId — soft-delete (set deleted_at),
 * KHÔNG xoá thật. Điều kiện: sách chưa published, HOẶC đã published
 * nhưng không exclusive. Sách published + exclusive không được xoá dưới
 * bất kỳ hình thức nào (trừ admin, qua route riêng
 * src/app/api/admin/books/[bookId]/route.ts). Chặn thêm nếu bất kỳ
 * chương nào của sách đã có giao dịch mua thật (purchase_transactions) —
 * bảo toàn lịch sử tài chính, không phải yêu cầu ban đầu của tác giả
 * nhưng an toàn hơn cho 1 sản phẩm có giao dịch token thật.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const { bookId } = await params;
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
  }

  const { data: book } = await supabase
    .from("books")
    .select("id, author_id, published, is_exclusive, deleted_at")
    .eq("id", bookId)
    .maybeSingle();

  if (!book || book.author_id !== userData.user.id || book.deleted_at) {
    return NextResponse.json(
      { error: "Không tìm thấy truyện hoặc bạn không có quyền xoá." },
      { status: 404 }
    );
  }

  if (book.published && book.is_exclusive) {
    return NextResponse.json(
      {
        error:
          "Không thể xoá tác phẩm đã xuất bản ở dạng độc quyền. Chuyển sang tự do trước (nếu đủ điều kiện) hoặc liên hệ quản trị viên.",
      },
      { status: 403 }
    );
  }

  const { data: chapters } = await supabase.from("chapters").select("id").eq("book_id", bookId);
  const chapterIds = (chapters ?? []).map((c) => c.id);

  if (chapterIds.length > 0) {
    // purchase_transactions.chapter_id là uuid trần, không FK tới
    // chapters (xem docs/supabase/schema.sql) — tự kiểm ở đây, DB không
    // có cách nào chặn việc này.
    const { data: purchase } = await supabase
      .from("purchase_transactions")
      .select("id")
      .in("chapter_id", chapterIds)
      .limit(1)
      .maybeSingle();

    if (purchase) {
      return NextResponse.json(
        { error: "Tác phẩm đã có giao dịch mua chương, không thể xoá." },
        { status: 409 }
      );
    }
  }

  const { error: deleteError } = await supabase
    .from("books")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", bookId);

  if (deleteError) {
    console.error("[authoring] soft-delete book failed:", deleteError);
    return NextResponse.json({ error: "Xoá thất bại. Vui lòng thử lại." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
