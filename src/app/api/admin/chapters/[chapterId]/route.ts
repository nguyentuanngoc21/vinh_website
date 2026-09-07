import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedAdminId } from "@/lib/wallet/session";
import {
  REASON_GROUPS,
  buildDetailText,
  buildRemovalNotificationText,
  buildRemovalSystemMessage,
  DEFAULT_RESPONSE_DAYS,
  type ReasonGroupId,
} from "@/lib/moderation/chapter-removal-templates";

/**
 * PATCH /api/admin/chapters/:chapterId — admin gỡ/khôi phục 1 chương,
 * override hoàn toàn (giống tinh thần api/admin/books/[bookId]/route.ts,
 * KHÔNG phải bản nới của route tác giả PATCH
 * api/authoring/chapters/[chapterId]/route.ts).
 *
 * `action: "remove"` — set published=false + ghi removed_at/removed_by/
 * removed_reason_*, rồi:
 *   1. Ghi audit vào chapter_moderation_actions.
 *   2. Tạo 1 dòng notifications (lớp A, ngắn).
 *   3. Gửi 1 direct_messages từ CHÍNH admin đang thực hiện thao tác này
 *      (lớp B, đầy đủ) — danh tính thật (tên/avatar thật), không che
 *      giấu dưới 1 tài khoản "hệ thống" riêng. context='moderation' chỉ
 *      để tách hòm thư này khỏi chat cá nhân nếu admin đó cũng tự nhắn
 *      tin bình thường với cùng tác giả — xem
 *      migrations/20260908_add_direct_message_context.sql. Nhờ vậy, ai
 *      gỡ chương thì người đó (đúng, không phải "tài khoản dùng chung")
 *      nhận được phản hồi của tác giả — không cần thêm màn hình admin
 *      nào khác để "phát" lại cho người khác.
 *
 * `action: "restore"` — ngược lại, published=true + xoá sạch removed_*,
 * cũng gửi 1 thông báo/tin nhắn ngắn báo đã khôi phục (không có trong
 * đặc tả gốc, thêm cho đối xứng với "remove" — bỏ dễ dàng nếu không cần).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  const { chapterId } = await params;
  const supabase = createServiceRoleClient();
  const adminId = await getAuthedAdminId(supabase);
  if (!adminId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const action = body?.action;
  if (action !== "remove" && action !== "restore") {
    return NextResponse.json({ error: "Thiếu action ('remove' hoặc 'restore')." }, { status: 400 });
  }

  const { data: chapter } = await supabase
    .from("chapters")
    .select("id, title, book_id")
    .eq("id", chapterId)
    .maybeSingle();
  if (!chapter) {
    return NextResponse.json({ error: "Không tìm thấy chương." }, { status: 404 });
  }

  const { data: book } = await supabase
    .from("books")
    .select("id, title, author_id")
    .eq("id", chapter.book_id)
    .maybeSingle();
  if (!book) {
    return NextResponse.json({ error: "Không tìm thấy truyện." }, { status: 404 });
  }

  let notificationTitle: string;
  let systemMessageBody: string;
  let notificationType: string;

  if (action === "remove") {
    const reasonGroup: ReasonGroupId | undefined = REASON_GROUPS.find((g) => g.id === body?.reasonGroup)?.id;
    if (!reasonGroup) {
      return NextResponse.json({ error: "Vui lòng chọn lý do gỡ hợp lệ." }, { status: 400 });
    }
    const subReason = typeof body?.subReason === "string" ? body.subReason : null;
    const freeText = typeof body?.detail === "string" ? body.detail : null;
    const detail = buildDetailText(subReason, freeText);
    // "chua_xac_dinh" không dùng {{chi_tiết}} trong template — mọi nhóm
    // khác bắt buộc phải có (đặc tả: "Tùy nhóm lý do", tức bắt buộc trừ
    // khi admin cố tình gỡ nhanh chưa phân loại).
    if (reasonGroup !== "chua_xac_dinh" && !detail) {
      return NextResponse.json({ error: "Vui lòng chọn sub-reason hoặc nhập chi tiết." }, { status: 400 });
    }
    const responseDays =
      typeof body?.responseDays === "number" && body.responseDays > 0 ? body.responseDays : DEFAULT_RESPONSE_DAYS;

    const { error: updateError } = await supabase
      .from("chapters")
      .update({
        published: false,
        removed_at: new Date().toISOString(),
        removed_by: adminId,
        removed_reason_group: reasonGroup,
        removed_reason_detail: detail || null,
      })
      .eq("id", chapterId);
    if (updateError) {
      console.error("[admin/chapters] remove failed:", updateError);
      return NextResponse.json({ error: "Gỡ chương thất bại." }, { status: 500 });
    }

    await supabase.from("chapter_moderation_actions").insert({
      chapter_id: chapterId,
      book_id: book.id,
      author_id: book.author_id,
      admin_id: adminId,
      action: "removed",
      reason_group: reasonGroup,
      reason_detail: detail || null,
    });

    notificationType = "chapter_removed";
    notificationTitle = buildRemovalNotificationText({
      group: reasonGroup,
      chapterTitle: chapter.title,
      bookTitle: book.title,
      detail,
    });
    systemMessageBody = buildRemovalSystemMessage({
      group: reasonGroup,
      chapterTitle: chapter.title,
      bookTitle: book.title,
      detail,
      responseDays,
    });
  } else {
    const { error: updateError } = await supabase
      .from("chapters")
      .update({
        published: true,
        removed_at: null,
        removed_by: null,
        removed_reason_group: null,
        removed_reason_detail: null,
      })
      .eq("id", chapterId);
    if (updateError) {
      console.error("[admin/chapters] restore failed:", updateError);
      return NextResponse.json({ error: "Khôi phục chương thất bại." }, { status: 500 });
    }

    await supabase.from("chapter_moderation_actions").insert({
      chapter_id: chapterId,
      book_id: book.id,
      author_id: book.author_id,
      admin_id: adminId,
      action: "restored",
    });

    notificationType = "chapter_restored";
    notificationTitle = `Chương "${chapter.title}" trong truyện "${book.title}" đã được khôi phục.`;
    systemMessageBody = [
      "Chào bạn,",
      "",
      `Chương ${chapter.title} của truyện ${book.title} đã được khôi phục và hiển thị trở lại.`,
      "",
      "Trân trọng,\nĐội ngũ Vịnh",
    ].join("\n");
  }

  // Người gửi = chính admin đang đăng nhập (adminId) — không tra tài
  // khoản "hệ thống" nào khác. Link kèm ?context=moderation để bấm vào
  // mở đúng hòm thư kiểm duyệt, không lẫn với hòm thư cá nhân (nếu có)
  // giữa admin này và tác giả.
  const link = `/ca-nhan?tab=chat&chat=${adminId}&context=moderation`;
  const [{ error: notifError }, { error: messageError }] = await Promise.all([
    supabase.from("notifications").insert({
      user_id: book.author_id,
      type: notificationType,
      title: notificationTitle,
      link,
    }),
    supabase.from("direct_messages").insert({
      sender_id: adminId,
      recipient_id: book.author_id,
      body: systemMessageBody,
      context: "moderation",
    }),
  ]);
  if (notifError) console.error("[admin/chapters] notification insert failed:", notifError);
  if (messageError) console.error("[admin/chapters] system message insert failed:", messageError);

  return NextResponse.json({ ok: true });
}
