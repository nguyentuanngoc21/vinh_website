import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CaretLeftIcon } from "@phosphor-icons/react/dist/ssr";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { ChapterModerationTable, type ChapterModerationRow } from "@/components/admin/chapter-moderation-table";

export const metadata: Metadata = { title: "Chương · Vịnh Admin" };

/**
 * Danh sách chương của 1 truyện, cho admin gỡ/khôi phục từng chương —
 * dẫn tới từ nút "Chương" ở content-table.tsx (/admin/noi-dung). Khác
 * hẳn khoá độc quyền/xoá TRUYỆN (đã có ở trang cha) — đây là hành động
 * CẤP CHƯƠNG, mới hoàn toàn (xem
 * migrations/20260908_add_chapter_moderation_and_notifications.sql +
 * api/admin/chapters/[chapterId]/route.ts).
 */
export default async function AdminBookChaptersPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;
  const supabase = createServiceRoleClient();

  const { data: book } = await supabase
    .from("books")
    .select("id, title, slug, author_id")
    .eq("id", bookId)
    .maybeSingle();
  if (!book) notFound();

  const { data: chapterRows } = await supabase
    .from("chapters")
    .select(
      "id, title, order_index, published, removed_at, removed_reason_group, removed_reason_detail, created_at"
    )
    .eq("book_id", bookId)
    .order("order_index", { ascending: true });

  const rows: ChapterModerationRow[] = (chapterRows ?? []).map((c) => ({
    id: c.id,
    title: c.title,
    orderIndex: c.order_index,
    published: c.published,
    removedAt: c.removed_at,
    removedReasonGroup: c.removed_reason_group,
    removedReasonDetail: c.removed_reason_detail,
  }));

  return (
    <>
      <Link
        href="/admin/noi-dung"
        className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-stone-alt no-underline hover:text-brand-ink"
      >
        <CaretLeftIcon size={14} /> Nội dung
      </Link>
      <div className="mb-6">
        <h1 className="text-[26px] font-bold text-brand-ink">{book.title}</h1>
        <p className="mt-0.5 text-sm text-stone-alt">
          Gỡ chương (bắt buộc chọn lý do) hoặc khôi phục — tác giả nhận được thông báo + tin nhắn
          hệ thống trong Hội thoại ngay khi gỡ.
        </p>
      </div>
      <ChapterModerationTable rows={rows} />
    </>
  );
}
