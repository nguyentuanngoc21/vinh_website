import { NextResponse } from "next/server";
import { contestLockResponse } from "@/lib/contests/trigger-errors";
import { getUserContext, requestError } from "@/lib/mobile/request-context";
import {
  hasAcceptedExclusivityPolicy,
  EXCLUSIVITY_AGREEMENT_ERROR,
  EXCLUSIVITY_AGREEMENT_ID,
} from "@/lib/authoring/exclusivity-agreement";
import { RewardEngine } from "@/lib/quests/reward-engine";
import { MAX_CHAPTER_CONTENT_LENGTH } from "@/lib/authoring/chapter-limits";

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
  if (typeof body.content === "string") {
    if (body.content.length > MAX_CHAPTER_CONTENT_LENGTH) {
      return NextResponse.json(
        { error: `Nội dung chương tối đa ${MAX_CHAPTER_CONTENT_LENGTH.toLocaleString("vi-VN")} ký tự.` },
        { status: 413 }
      );
    }
    update.content = body.content;
  }
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

  let auth;
  try {
    auth = await getUserContext(request);
  } catch (e) {
    return requestError(e);
  }
  const { supabase, userId, admin } = auth;
  if (!userId) {
    return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
  }

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
    .select("removed_at, removed_reason_detail, published")
    .eq("id", chapterId)
    .maybeSingle();
  // Dùng để phát hiện chiều nháp -> xuất bản THẬT (không phải sửa nội
  // dung 1 chương đã xuất bản từ trước) — cho nhiệm vụ author_publish_chapter
  // bên dưới, sau khi update thành công.
  const wasPublished = currentChapter?.published === true;
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
        if (!(await hasAcceptedExclusivityPolicy(supabase, userId))) {
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
    // D8 — sách đang dự thi: mọi chương phải miễn phí (trigger chapters_block_paid_during_contest).
    const locked = contestLockResponse(error);
    if (locked) return locked;
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

  // Nhiệm vụ "Ra chương mới" — CHỈ tính đúng lần chuyển nháp -> xuất bản
  // (wasPublished false/null trước update), không tính lần sửa nội dung 1
  // chương đã xuất bản từ trước. incrementTaskProgress() cần service-role
  // (RPC revoke EXECUTE khỏi authenticated) — khác `supabase` cookie-bound
  // đang dùng cho phần còn lại của route. admin() là service-role của CÙNG
  // project với người gọi (web hoặc mobile).
  if (update.published === true && !wasPublished) {
    const result = await RewardEngine.incrementTaskProgress(admin(), {
      userId,
      taskCode: "author_publish_chapter",
    });
    if (!result.ok) console.error("[authoring] incrementTaskProgress failed:", result.error);
  }

  return NextResponse.json(data);
}

/**
 * DELETE /api/authoring/chapters/:chapterId — xoá HẲN 1 chương (chương không
 * có deleted_at). Quy tắc (25/09/2026), policy "authors delete draft chapters
 * on their own books" (migrations/20260925_add_chapter_delete_and_reorder.sql)
 * là chốt chặn thật ở DB, kiểm lại ở đây để trả lỗi tiếng Việt:
 *   - chỉ chương NHÁP (đang xuất bản thì lưu nháp trước);
 *   - không phải chương đang bị admin gỡ (giữ bằng chứng kiểm duyệt);
 *   - không phải chương cuối (is_last_chapter không đảo được — xoá sẽ lách luật);
 *   - chưa có giao dịch mua (purchase_transactions.chapter_id không FK — tự kiểm,
 *     giống DELETE /api/authoring/books/[bookId]).
 * Bình luận/highlight/lịch sử đọc của chương bị xoá theo (on delete cascade).
 * order_index các chương sau KHÔNG dồn lại — thứ tự tương đối giữ nguyên.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  const { chapterId } = await params;
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

  const { data: chapter } = await supabase
    .from("chapters")
    .select("id, book_id, published, removed_at, is_last_chapter")
    .eq("id", chapterId)
    .maybeSingle();
  const { data: book } = chapter
    ? await supabase.from("books").select("author_id, deleted_at").eq("id", chapter.book_id).maybeSingle()
    : { data: null };
  if (!chapter || !book || book.author_id !== userId || book.deleted_at) {
    return NextResponse.json({ error: "Không tìm thấy chương hoặc bạn không có quyền xoá." }, { status: 404 });
  }
  if (chapter.published) {
    return NextResponse.json({ error: "Chỉ xoá được chương nháp. Hãy lưu nháp chương này trước." }, { status: 409 });
  }
  if (chapter.removed_at) {
    return NextResponse.json({ error: "Chương đang bị quản trị viên gỡ, không thể xoá." }, { status: 403 });
  }
  if (chapter.is_last_chapter) {
    return NextResponse.json({ error: "Không thể xoá chương đã đánh dấu là chương cuối." }, { status: 409 });
  }

  const { data: purchase } = await supabase
    .from("purchase_transactions")
    .select("id")
    .eq("chapter_id", chapterId)
    .limit(1)
    .maybeSingle();
  if (purchase) {
    return NextResponse.json({ error: "Chương đã có người mua, không thể xoá." }, { status: 409 });
  }

  const { error, count } = await supabase.from("chapters").delete({ count: "exact" }).eq("id", chapterId);
  if (error) {
    console.error("[authoring] delete chapter failed:", error);
    return NextResponse.json({ error: "Xoá thất bại. Vui lòng thử lại." }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ error: "Không xoá được chương này." }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
