import { NextResponse } from "next/server";
import { contestLockResponse } from "@/lib/contests/trigger-errors";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthedAdminId } from "@/lib/wallet/session";
import { revalidatePublicBooks } from "@/lib/cache/public-data";
import {
  REASON_GROUPS,
  buildDetailText,
  buildRemovalNotificationText,
  buildRemovalSystemMessage,
  DEFAULT_RESPONSE_DAYS,
  type ReasonGroupId,
} from "@/lib/moderation/chapter-removal-templates";

/**
 * PATCH /api/admin/books/:bookId — admin/super_admin override cho trang
 * "Nội dung" (src/app/admin/noi-dung/page.tsx). Dùng service-role, bỏ
 * qua RLS/GRANT của books VÀ mọi business rule ở
 * src/app/api/authoring/books/[bookId]/route.ts (khoá exclusivity 3
 * ngày, điều kiện xoá/giao dịch) — đúng nghĩa "override", không phải bản
 * nới của route tác giả.
 *
 * `deleted: true` giờ dùng CHUNG kiến trúc kiểm duyệt với
 * api/admin/chapters/[chapterId]/route.ts (bắt buộc chọn lý do, ghi
 * book_moderation_actions, gửi notifications + direct_messages từ chính
 * admin thực hiện) — xem migrations/archive/20260908_add_book_moderation.sql.
 * Trước đây route này chỉ set deleted_at, không có lý do/thông báo gì cả.
 *
 * `is_exclusive` (bật/tắt độc quyền) đi qua RPC admin_set_book_exclusive,
 * bắt buộc `exclusiveReason` — trigger ghi book_exclusivity_events (ai, khi
 * nào, lý do). Xem migrations/20260930_book_exclusivity_default_and_history.sql.
 * Gửi riêng, không kèm `deleted` trong cùng request.
 *
 * `deleted: false` (khôi phục) vẫn là override đơn giản, không cần lý do.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const { bookId } = await params;
  const supabase = createServiceRoleClient();
  const adminId = await getAuthedAdminId(supabase);
  if (!adminId) {
    return NextResponse.json({ error: "Bạn không có quyền thực hiện thao tác này." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  if (typeof body?.is_exclusive === "boolean") {
    if (body?.deleted !== undefined) {
      return NextResponse.json({ error: "Đổi độc quyền và xoá/khôi phục phải gửi riêng." }, { status: 400 });
    }
    const reason = typeof body?.exclusiveReason === "string" ? body.exclusiveReason.trim() : "";
    if (!reason) {
      return NextResponse.json({ error: "Vui lòng nhập lý do đổi độc quyền." }, { status: 400 });
    }
    const { data: book, error } = await supabase.rpc("admin_set_book_exclusive", {
      p_book_id: bookId,
      p_admin_id: adminId,
      p_exclusive: body.is_exclusive,
      p_reason: reason,
    });
    if (error) {
      // D11 chặn cả admin: muốn tắt độc quyền thì loại bài dự thi trước (có lý do, có nhật ký).
      const locked = contestLockResponse(error);
      if (locked) return locked;
      console.error("[admin] set book exclusive failed:", error);
      return NextResponse.json({ error: "Cập nhật thất bại. Vui lòng thử lại." }, { status: 500 });
    }
    if (!book?.id) {
      return NextResponse.json({ error: "Không tìm thấy truyện." }, { status: 404 });
    }
    revalidatePublicBooks();
    return NextResponse.json({
      id: book.id,
      title: book.title,
      author_id: book.author_id,
      is_exclusive: book.is_exclusive,
      deleted_at: book.deleted_at,
    });
  }

  const update: {
    deleted_at?: string | null;
    removed_by?: string | null;
    removed_reason_group?: string | null;
    removed_reason_detail?: string | null;
  } = {};

  const isDeleting = body?.deleted === true;
  const isRestoring = body?.deleted === false;

  let reasonGroup: ReasonGroupId | null = null;
  let detail = "";
  let responseDays = DEFAULT_RESPONSE_DAYS;

  if (isDeleting) {
    reasonGroup = REASON_GROUPS.find((g) => g.id === body?.reasonGroup)?.id ?? null;
    if (!reasonGroup) {
      return NextResponse.json({ error: "Vui lòng chọn lý do gỡ hợp lệ." }, { status: 400 });
    }
    const subReason = typeof body?.subReason === "string" ? body.subReason : null;
    const freeText = typeof body?.detail === "string" ? body.detail : null;
    detail = buildDetailText(subReason, freeText);
    // "chua_xac_dinh" không dùng {{chi_tiết}} trong template — bắt buộc
    // mọi nhóm khác, giống chapters.
    if (reasonGroup !== "chua_xac_dinh" && !detail) {
      return NextResponse.json({ error: "Vui lòng chọn sub-reason hoặc nhập chi tiết." }, { status: 400 });
    }
    responseDays =
      typeof body?.responseDays === "number" && body.responseDays > 0 ? body.responseDays : DEFAULT_RESPONSE_DAYS;

    update.deleted_at = new Date().toISOString();
    update.removed_by = adminId;
    update.removed_reason_group = reasonGroup;
    update.removed_reason_detail = detail || null;
  } else if (isRestoring) {
    update.deleted_at = null;
    update.removed_by = null;
    update.removed_reason_group = null;
    update.removed_reason_detail = null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Không có gì để cập nhật." }, { status: 400 });
  }

  const { data: book, error } = await supabase
    .from("books")
    .update(update)
    .eq("id", bookId)
    .select("id, title, author_id, is_exclusive, deleted_at, removed_by, removed_reason_group, removed_reason_detail")
    .maybeSingle();

  if (error) {
    console.error("[admin] update book failed:", error);
    return NextResponse.json({ error: "Cập nhật thất bại. Vui lòng thử lại." }, { status: 500 });
  }
  if (!book) {
    return NextResponse.json({ error: "Không tìm thấy truyện." }, { status: 404 });
  }

  if (isDeleting || isRestoring) {
    await supabase.from("book_moderation_actions").insert({
      book_id: book.id,
      author_id: book.author_id,
      admin_id: adminId,
      action: isDeleting ? "removed" : "restored",
      reason_group: reasonGroup,
      reason_detail: detail || null,
    });

    const notificationType = isDeleting ? "book_removed" : "book_restored";
    const notificationTitle = isDeleting
      ? buildRemovalNotificationText({ group: reasonGroup!, chapterTitle: null, bookTitle: book.title, detail })
      : `Truyện "${book.title}" đã được khôi phục.`;
    const systemMessageBody = isDeleting
      ? buildRemovalSystemMessage({
          group: reasonGroup!,
          chapterTitle: null,
          bookTitle: book.title,
          detail,
          responseDays,
        })
      : ["Chào bạn,", "", `Truyện ${book.title} đã được khôi phục và hiển thị trở lại.`, "", "Trân trọng,\nĐội ngũ Vịnh"].join(
          "\n"
        );

    // Người gửi = chính admin đang đăng nhập — cùng cách chapters/[chapterId]/route.ts,
    // xem comment ở đó cho lý do không dùng tài khoản "hệ thống" riêng.
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
    if (notifError) console.error("[admin/books] notification insert failed:", notifError);
    if (messageError) console.error("[admin/books] system message insert failed:", messageError);


    // Làm mới cache trang công khai (lib/cache/public-data.ts).
    revalidatePublicBooks();
  }

  // Bảng "Nội dung" hiện "xoá bởi @username" — trả kèm để client khỏi reload.
  let removedByUsername: string | null = null;
  if (book.removed_by) {
    const { data: remover } = await supabase.from("profiles").select("username").eq("id", book.removed_by).maybeSingle();
    removedByUsername = remover?.username ?? "—";
  }

  return NextResponse.json({ ...book, removed_by_username: removedByUsername });
}
