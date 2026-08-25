import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { AuthorWorkspace } from "@/components/author/author-workspace";

export async function generateMetadata({
  params,
}: PageProps<"/author/[bookId]/[chapterId]">): Promise<Metadata> {
  const { chapterId } = await params;
  const supabase = await createClient();
  const { data: chapter } = await supabase
    .from("chapters")
    .select("title")
    .eq("id", chapterId)
    .maybeSingle();

  return { title: `${chapter?.title ?? "Chương"} · Vịnh Tác giả` };
}

/**
 * Trang editor thật — thay cho page.tsx tĩnh cũ (ChapterEditor +
 * PublishPanel hardcode "Vũng Vịnh Cuối Trời"/"Chương 14"). RLS select
 * của books/chapters cho phép đọc sách ĐÃ PUBLISHED của người khác (đúng
 * cho trang đọc công khai) — nên phải tự kiểm author_id ở đây, không chỉ
 * dựa RLS, để người lạ không mở được UI "sửa" trên 1 sách published của
 * người khác (ghi thì RLS đã chặn, nhưng đọc để hiện UI edit thì không).
 */
export default async function AuthorChapterPage({
  params,
}: PageProps<"/author/[bookId]/[chapterId]">) {
  const { bookId, chapterId } = await params;
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    redirect("/dang-nhap");
  }

  const { data: book } = await supabase
    .from("books")
    .select("id, title, genre, tags, slug, published, author_id")
    .eq("id", bookId)
    .maybeSingle();

  if (!book || book.author_id !== userData.user.id) {
    notFound();
  }

  const { data: chapter } = await supabase
    .from("chapters")
    .select("id, title, content, published, price, is_exclusive, is_last_chapter")
    .eq("id", chapterId)
    .eq("book_id", bookId)
    .maybeSingle();

  if (!chapter) {
    notFound();
  }

  return (
    <AuthorWorkspace
      bookId={book.id}
      bookTitle={book.title}
      bookGenre={book.genre}
      bookTags={book.tags}
      bookSlug={book.slug}
      bookPublished={book.published}
      chapter={chapter}
    />
  );
}
