import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { ContentTable, type ContentBookRow } from "@/components/admin/content-table";

export const metadata: Metadata = { title: "Nội dung · Vịnh Admin" };

const FETCH_LIMIT = 200;

/**
 * Trang quản lý nội dung ĐẦU TIÊN trong /admin (trước đây "Nội dung" chỉ
 * là placeholder "Sắp có" — xem src/components/admin/admin-sidebar.tsx).
 * Cho phép admin/super_admin đổi độc quyền hoặc xoá/khôi phục BẤT KỲ
 * truyện nào, bỏ qua toàn bộ luật khoá 3 ngày/điều kiện xoá của tác giả
 * (xem src/app/api/admin/books/[bookId]/route.ts) — đúng nghĩa override.
 *
 * requireAdmin() đã chạy ở src/app/admin/layout.tsx (cha) — không double
 * -check lại ở đây, khớp cách src/app/admin/page.tsx đang làm.
 *
 * Query qua service-role (không qua RLS) vì cần đọc TẤT CẢ truyện, không
 * chỉ của 1 tác giả. Giới hạn 200 dòng mới nhất — ghi rõ trên UI nếu bị
 * cắt (không cắt âm thầm); tìm kiếm lọc phía CLIENT trong 200 dòng này.
 */
export default async function AdminContentPage() {
  const supabase = createServiceRoleClient();

  const { data: bookRows } = await supabase
    .from("books")
    .select("id, title, slug, author_id, published, is_exclusive, deleted_at, created_at")
    .order("created_at", { ascending: false })
    .limit(FETCH_LIMIT + 1);

  const truncated = (bookRows?.length ?? 0) > FETCH_LIMIT;
  const books = (bookRows ?? []).slice(0, FETCH_LIMIT);

  const authorIds = Array.from(new Set(books.map((b) => b.author_id)));
  const { data: profileRows } = authorIds.length
    ? await supabase.from("profiles").select("id, username").in("id", authorIds)
    : { data: [] as { id: string; username: string }[] };
  const usernameById = new Map((profileRows ?? []).map((p) => [p.id, p.username]));

  const rows: ContentBookRow[] = books.map((b) => ({
    id: b.id,
    title: b.title,
    slug: b.slug,
    authorUsername: usernameById.get(b.author_id) ?? "—",
    published: b.published,
    isExclusive: b.is_exclusive,
    deletedAt: b.deleted_at,
  }));

  return (
    <>
      <div className="mb-6">
        <h1 className="text-[26px] font-bold text-brand-ink">Nội dung</h1>
        <p className="mt-0.5 text-sm text-stone-alt">
          Đổi độc quyền, xoá/khôi phục bất kỳ truyện nào — bỏ qua luật khoá 3 ngày và điều kiện
          xoá thông thường của tác giả.
        </p>
      </div>
      <ContentTable rows={rows} truncated={truncated} fetchLimit={FETCH_LIMIT} />
    </>
  );
}
