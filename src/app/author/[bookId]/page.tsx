import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { BookOverview } from "@/components/author/book-overview";
import { resolveBookCoverUrl } from "@/lib/covers/resolve-book-cover";

export async function generateMetadata({
  params,
}: PageProps<"/author/[bookId]">): Promise<Metadata> {
  const { bookId } = await params;
  const supabase = await createClient();
  const { data: book } = await supabase.from("books").select("title").eq("id", bookId).maybeSingle();
  return { title: `${book?.title ?? "Truyện"} · Vịnh Tác giả` };
}

/**
 * Trang tổng quan 1 truyện — danh sách toàn bộ chương, mới thêm (trước đây
 * không có trang nào cho việc này, sidebar chỉ link thẳng vào chương mới
 * nhất). Cùng pattern ownership-check với
 * src/app/author/[bookId]/[chapterId]/page.tsx: RLS SELECT trên books cho
 * phép đọc sách ĐÃ PUBLISHED của người khác, nên phải tự kiểm author_id ở
 * đây, không chỉ dựa RLS.
 */
export default async function AuthorBookOverviewPage({
  params,
}: PageProps<"/author/[bookId]">) {
  const { bookId } = await params;
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    redirect("/dang-nhap");
  }

  const { data: book } = await supabase
    .from("books")
    .select("id, title, genre, slug, published, author_id, is_exclusive, deleted_at, cover_design_item_id, finalized_at")
    .eq("id", bookId)
    .maybeSingle();

  // deleted_at khác null: đã bị chính tác giả xoá (soft-delete) — coi như
  // không tồn tại với họ nữa.
  if (!book || book.author_id !== userData.user.id || book.deleted_at) {
    notFound();
  }

  const [{ data: chapters }, coverUrl, { data: grantRow }] = await Promise.all([
    supabase
      .from("chapters")
      .select("id, title, order_index, published, price, is_last_chapter")
      .eq("book_id", bookId)
      .order("order_index", { ascending: true }),
    resolveBookCoverUrl(supabase, book),
    // Chỉ có nhiều nhất 1 grant đang hoạt động/book (partial unique index,
    // xem migrations/20260901_add_manuscript_share.sql) — join sang
    // profiles để hiện @username thay vì chỉ uuid.
    supabase
      .from("manuscript_access_grants")
      .select("granted_at, profiles:granted_to_user_id(username, nickname)")
      .eq("book_id", bookId)
      .is("revoked_at", null)
      .maybeSingle(),
  ]);

  const grantProfile = grantRow?.profiles as unknown as { username: string; nickname: string } | null;

  return (
    <BookOverview
      bookId={book.id}
      bookTitle={book.title}
      bookGenre={book.genre}
      bookSlug={book.slug}
      bookPublished={book.published}
      bookIsExclusive={book.is_exclusive}
      coverUrl={coverUrl}
      chapters={chapters ?? []}
      bookFinalized={!!book.finalized_at}
      initialManuscriptGrant={
        grantRow && grantProfile
          ? { username: grantProfile.username, nickname: grantProfile.nickname, grantedAt: grantRow.granted_at }
          : null
      }
    />
  );
}
