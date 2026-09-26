import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getBookContestLocks } from "@/lib/contests/author-service";
import { AuthorWorkspace } from "@/components/author/author-workspace";
import { getChapterAudio } from "@/lib/audio/get-chapter-audio";

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
    .select(
      "id, title, synopsis, genre, tags, slug, published, author_id, is_exclusive, published_at, deleted_at"
    )
    .eq("id", bookId)
    .maybeSingle();

  // deleted_at khác null: sách đã bị tác giả xoá (soft-delete) — coi như
  // không tồn tại với chính họ nữa, giống không tìm thấy.
  if (!book || book.author_id !== userData.user.id || book.deleted_at) {
    notFound();
  }

  const { data: chapter } = await supabase
    .from("chapters")
    .select("id, title, content, published, price, audio_url, audio_price, is_last_chapter")
    .eq("id", chapterId)
    .eq("book_id", bookId)
    .maybeSingle();

  if (!chapter) {
    notFound();
  }

  const [linkedAudio, { data: bookCharacters }, { data: taggedRows }, contestLock] = await Promise.all([
    getChapterAudio(supabase, chapter.id),
    supabase.from("characters").select("id, name, role, trope").eq("book_id", bookId).order("created_at", { ascending: true }),
    supabase.from("chapter_characters").select("character_id").eq("chapter_id", chapterId),
    // D8 / D11 — cùng điều kiện với 2 trigger trong DB (DB vẫn là chốt chặn thật).
    getBookContestLocks(createServiceRoleClient(), bookId),
  ]);

  return (
    <AuthorWorkspace
      bookId={book.id}
      bookTitle={book.title}
      bookSynopsis={book.synopsis}
      bookGenre={book.genre}
      bookTags={book.tags}
      bookSlug={book.slug}
      bookPublished={book.published}
      bookIsExclusive={book.is_exclusive}
      bookPublishedAt={book.published_at}
      chapter={chapter}
      linkedAudio={linkedAudio}
      bookCharacters={bookCharacters ?? []}
      initialTaggedCharacterIds={(taggedRows ?? []).map((r) => r.character_id)}
      contestLock={contestLock}
    />
  );
}
