import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  hasAcceptedExclusivityPolicy,
  EXCLUSIVITY_AGREEMENT_ERROR,
  EXCLUSIVITY_AGREEMENT_ID,
} from "@/lib/authoring/exclusivity-agreement";

/**
 * PATCH /api/authoring/chapters/:chapterId — dùng cho cả "Lưu nháp"
 * (published: false) và "Xuất bản" (published: true) ở
 * chapter-editor.tsx/publish-panel.tsx, cùng việc lưu Giá chương (price —
 * migrations/20260820_add_chapter_price.sql). Độc quyền KHÔNG còn ở đây —
 * đã chuyển lên cấp truyện (books.is_exclusive, PATCH qua
 * /api/authoring/books/[bookId] — xem migrations/20260826_add_book_exclusivity.sql).
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
    audio_url?: string | null;
    audio_price?: number;
    is_last_chapter?: boolean;
  } = {};

  if (typeof body.title === "string" && body.title.trim()) update.title = body.title.trim();
  if (typeof body.content === "string") update.content = body.content;
  if (typeof body.published === "boolean") update.published = body.published;
  if (typeof body.price === "number" && Number.isFinite(body.price) && body.price >= 0) {
    update.price = Math.round(body.price);
  }
  // audio_url/audio_price — xem POST /api/authoring/books (cùng công thức).
  // audio_url cho phép ghi đè về null (bỏ link đã gắn) — khác `title`
  // (không cho lưu rỗng), field body.audio_url === "" cũng hợp lệ để xoá.
  if (typeof body.audio_url === "string" || body.audio_url === null) {
    const trimmed = typeof body.audio_url === "string" ? body.audio_url.trim() : "";
    update.audio_url = trimmed || null;
  }
  if (typeof body.audio_price === "number" && Number.isFinite(body.audio_price) && body.audio_price >= 0) {
    update.audio_price = Math.round(body.audio_price);
  }
  if (typeof body.is_last_chapter === "boolean") update.is_last_chapter = body.is_last_chapter;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Không có gì để cập nhật." }, { status: 400 });
  }

  const supabase = await createClient();

  // Chương đang bị ADMIN gỡ (removed_at khác null, xem
  // migrations/20260908_add_chapter_moderation_and_notifications.sql) —
  // chặn MỌI sửa đổi, không chỉ published=true. RLS "authors update
  // chapters on their own books" chỉ kiểm quyền sở hữu, không biết gì về
  // removed_at, nên nếu không chặn ở đây tác giả có thể tự xuất bản lại
  // (hoặc sửa nội dung) 1 chương đang bị kiểm duyệt, vô hiệu hoá hoàn
  // toàn hành động của admin. Chỉ admin (PATCH /api/admin/chapters/:id,
  // action=restore) mới gỡ được cờ này.
  const { data: currentChapter } = await supabase
    .from("chapters")
    .select("removed_at, removed_reason_detail")
    .eq("id", chapterId)
    .maybeSingle();
  if (currentChapter?.removed_at) {
    return NextResponse.json(
      {
        error: currentChapter.removed_reason_detail
          ? `Chương này đã bị gỡ bởi quản trị viên (${currentChapter.removed_reason_detail}) — không thể sửa cho tới khi được khôi phục. Xem Hội thoại để biết chi tiết.`
          : "Chương này đã bị gỡ bởi quản trị viên — không thể sửa cho tới khi được khôi phục. Xem Hội thoại để biết chi tiết.",
      },
      { status: 403 }
    );
  }

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

  // Chặn XUẤT BẢN (không chặn lưu nháp) 1 chương của sách ĐANG độc quyền
  // nếu tác giả chưa xác nhận (hoặc xác nhận đã lỗi thời — hợp đồng vừa
  // cập nhật) Hợp đồng khai thác tác phẩm độc quyền. Cần kiểm TRƯỚC khi
  // update — khác PATCH /api/authoring/books/[bookId] (chặn lúc BẬT
  // is_exclusive), route này phải chặn cả trường hợp sách đã bật
  // is_exclusive TỪ TRƯỚC (kể cả trước khi tính năng này tồn tại) mà tác
  // giả chưa từng xác nhận, rồi giờ xuất bản thêm chương mới — is_exclusive
  // không đổi nên PATCH books/[bookId] không có cơ hội chặn lại.
  if (update.published === true) {
    const { data: chapterBook } = await supabase
      .from("chapters")
      .select("book_id")
      .eq("id", chapterId)
      .maybeSingle();
    if (chapterBook) {
      const { data: book } = await supabase
        .from("books")
        .select("is_exclusive")
        .eq("id", chapterBook.book_id)
        .maybeSingle();
      if (book?.is_exclusive) {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user || !(await hasAcceptedExclusivityPolicy(supabase, userData.user.id))) {
          return NextResponse.json(
            { error: EXCLUSIVITY_AGREEMENT_ERROR, missingAgreementIds: [EXCLUSIVITY_AGREEMENT_ID] },
            { status: 403 }
          );
        }
      }
    }
  }

  const { data, error } = await supabase
    .from("chapters")
    .update(update)
    .eq("id", chapterId)
    .select("id, book_id, title, content, published, price, audio_url, audio_price, is_last_chapter")
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
