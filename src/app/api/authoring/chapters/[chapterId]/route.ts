import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * PATCH /api/authoring/chapters/:chapterId — dùng cho cả "Lưu nháp"
 * (published: false) và "Xuất bản" (published: true) ở
 * chapter-editor.tsx/publish-panel.tsx, cùng việc lưu Độc quyền/Giá
 * chương (is_exclusive/price — migrations/20260820_add_chapter_price.sql).
 * Không tự check ownership tay — policy "authors update chapters on
 * their own books" (docs/supabase/schema.sql) đã chặn qua RLS.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  const { chapterId } = await params;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
  }

  const update: {
    title?: string;
    content?: string;
    published?: boolean;
    price?: number;
    is_exclusive?: boolean;
    is_last_chapter?: boolean;
  } = {};

  if (typeof body.title === "string" && body.title.trim()) update.title = body.title.trim();
  if (typeof body.content === "string") update.content = body.content;
  if (typeof body.published === "boolean") update.published = body.published;
  if (typeof body.price === "number" && Number.isFinite(body.price) && body.price >= 0) {
    update.price = Math.round(body.price);
  }
  if (typeof body.is_exclusive === "boolean") update.is_exclusive = body.is_exclusive;
  if (typeof body.is_last_chapter === "boolean") update.is_last_chapter = body.is_last_chapter;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Không có gì để cập nhật." }, { status: 400 });
  }

  const supabase = await createClient();

  // Defense-in-depth cho chiều true -> false: trigger DB
  // prevent_unset_last_chapter (migrations/20260824_add_chapter_is_last.sql)
  // là chốt chặn thật; kiểm tra sớm ở đây chỉ để trả lỗi tiếng Việt gọn
  // thay vì để lộ exception thô của Postgres.
  if (update.is_last_chapter === false) {
    const { data: current } = await supabase
      .from("chapters")
      .select("is_last_chapter")
      .eq("id", chapterId)
      .maybeSingle();
    if (current?.is_last_chapter) {
      return NextResponse.json(
        { error: "Không thể bỏ đánh dấu chương cuối sau khi đã lưu." },
        { status: 400 }
      );
    }
  }

  const { data, error } = await supabase
    .from("chapters")
    .update(update)
    .eq("id", chapterId)
    .select("id, book_id, title, content, published, price, is_exclusive, is_last_chapter")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      // chapters_one_last_chapter_per_book_idx — 1 chương khác trong cùng
      // sách đã được đánh dấu là chương cuối.
      return NextResponse.json(
        { error: "Sách này đã có một chương khác được đánh dấu là chương cuối." },
        { status: 409 }
      );
    }
    console.error("[authoring] update chapter failed:", error);
    return NextResponse.json({ error: "Lưu thất bại. Vui lòng thử lại." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: "Không tìm thấy chương hoặc bạn không có quyền sửa." },
      { status: 404 }
    );
  }

  // Xuất bản chương đầu tiên của 1 sách là hành động khiến sách đó CÔNG
  // KHAI — books.published mặc định false lúc tạo và trước giờ không có
  // nơi nào set nó thành true, nên trang /truyen/[slug] (và RLS "published
  // books are public") sẽ không bao giờ thấy được sách nếu không set ở
  // đây. .eq("published", false) chỉ để tránh 1 write thừa khi sách đã
  // public rồi — không phải điều kiện bảo mật (RLS đã chặn owner-only).
  if (update.published === true) {
    const { error: bookError } = await supabase
      .from("books")
      .update({ published: true })
      .eq("id", data.book_id)
      .eq("published", false);
    if (bookError) console.error("[authoring] publish book failed:", bookError);
  }

  return NextResponse.json(data);
}
