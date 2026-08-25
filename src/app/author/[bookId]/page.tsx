import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { BookOverview } from "@/components/author/book-overview";

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
    .select("id, title, genre, slug, published, author_id")
    .eq("id", bookId)
    .maybeSingle();

  if (!book || book.author_id !== userData.user.id) {
    notFound();
  }

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, title, order_index, published, price, is_exclusive, is_last_chapter")
    .eq("book_id", bookId)
    .order("order_index", { ascending: true });

  return (
    <BookOverview
      bookId={book.id}
      bookTitle={book.title}
      bookGenre={book.genre}
      bookSlug={book.slug}
      bookPublished={book.published}
      chapters={chapters ?? []}
    />
  );
}
