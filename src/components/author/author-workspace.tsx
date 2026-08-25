"use client";

import { useState } from "react";
import { ChapterEditor } from "@/components/author/chapter-editor";
import { PublishPanel } from "@/components/author/publish-panel";
import type { BookGenre } from "@/lib/supabase/types";

export type WorkspaceChapter = {
  id: string;
  title: string;
  content: string;
  published: boolean;
  price: number;
  is_exclusive: boolean;
  is_last_chapter: boolean;
};

type AuthorWorkspaceProps = {
  bookId: string;
  bookTitle: string;
  bookGenre: BookGenre | null;
  bookTags: string[];
  bookSlug: string;
  bookPublished: boolean;
  chapter: WorkspaceChapter;
};

/**
 * ChapterEditor (tiêu đề/nội dung chương) và PublishPanel (độc quyền/giá/
 * thể loại/nút lưu) cùng sửa 1 chương, nhưng là 2 Client Component tách
 * biệt (author/[bookId]/[chapterId]/page.tsx là Server Component, không
 * giữ được useState) — wrapper mỏng này giữ state chung, 2 component con
 * chỉ còn là UI thuần nhận props, không tự useState nội dung chương nữa.
 */
export function AuthorWorkspace({
  bookId,
  bookTitle: initialBookTitle,
  bookGenre,
  bookTags,
  bookSlug,
  bookPublished,
  chapter,
}: AuthorWorkspaceProps) {
  const [bookTitle, setBookTitle] = useState(initialBookTitle);
  // Server truyền trạng thái published của SÁCH lúc trang tải — chương
  // đầu tiên xuất bản thành công (nhánh dưới) khiến sách chuyển public
  // (xem src/app/api/authoring/chapters/[chapterId]/route.ts), nhưng
  // client không tự biết trừ khi cập nhật state này ngay lúc đó.
  const [isBookPublished, setIsBookPublished] = useState(bookPublished);
  const [title, setTitle] = useState(chapter.title);
  const [content, setContent] = useState(chapter.content);
  const [published, setPublished] = useState(chapter.published);
  const [price, setPrice] = useState(chapter.price);
  const [isExclusive, setIsExclusive] = useState(chapter.is_exclusive);
  const [genre, setGenre] = useState<BookGenre | null>(bookGenre);
  const [tags, setTags] = useState<string[]>(bookTags);
  const [isLastChapter, setIsLastChapter] = useState(chapter.is_last_chapter);
  // Đã lưu true rồi thì khoá vĩnh viễn — khớp trigger DB
  // prevent_unset_last_chapter (không cho đổi lại false).
  const [isLastChapterLocked, setIsLastChapterLocked] = useState(chapter.is_last_chapter);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async (nextPublished: boolean) => {
    if (saving) return;
    setSaving(true);
    setError(null);

    let res: Response;
    try {
      res = await fetch(`/api/authoring/chapters/${chapter.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content,
          published: nextPublished,
          price,
          is_exclusive: isExclusive,
          is_last_chapter: isLastChapter,
        }),
      });
    } catch {
      setError("Không thể kết nối máy chủ. Vui lòng thử lại sau.");
      setSaving(false);
      return;
    }

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError((data && typeof data.error === "string" && data.error) || "Lưu thất bại. Vui lòng thử lại.");
      setSaving(false);
      return;
    }

    setPublished(nextPublished);
    if (nextPublished) setIsBookPublished(true);
    if (isLastChapter) setIsLastChapterLocked(true);
    setSavedAt(new Date());
    setSaving(false);
  };

  const handleGenreChange = async (nextGenre: BookGenre) => {
    setGenre(nextGenre);
    try {
      await fetch(`/api/authoring/books/${bookId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ genre: nextGenre }),
      });
    } catch {
      // Đổi thể loại là thao tác phụ, không chặn luồng viết/lưu chương
      // nếu lỗi mạng — bỏ qua lặng lẽ, giá trị hiển thị vẫn đổi (optimistic),
      // lần đổi tiếp theo hoặc F5 sẽ tự đồng bộ lại nếu request này thật
      // sự thất bại.
    }
  };

  const handleBookTitleCommit = async () => {
    const trimmed = bookTitle.trim();
    if (!trimmed) {
      // Không cho lưu tên rỗng — quay lại giá trị trước đó thay vì để
      // sách không tên (title not null ở DB, PATCH rỗng cũng bị API bỏ qua).
      setBookTitle(initialBookTitle);
      return;
    }
    setBookTitle(trimmed);
    try {
      await fetch(`/api/authoring/books/${bookId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
    } catch {
      // Cùng cách xử lý với handleGenreChange — thao tác phụ, không chặn
      // luồng viết/lưu chương nếu lỗi mạng.
    }
  };

  const handleTagsChange = async (nextTags: string[]) => {
    setTags(nextTags);
    try {
      await fetch(`/api/authoring/books/${bookId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: nextTags }),
      });
    } catch {
      // Cùng cách xử lý với handleGenreChange — thao tác phụ, không chặn
      // luồng viết/lưu chương nếu lỗi mạng.
    }
  };

  return (
    <>
      <ChapterEditor
        bookTitle={bookTitle}
        title={title}
        onTitleChange={setTitle}
        content={content}
        onContentChange={setContent}
        savedAt={savedAt}
        isLastChapter={isLastChapter}
        onIsLastChapterToggle={() => setIsLastChapter((v) => !v)}
        isLastChapterLocked={isLastChapterLocked}
        bookSlug={bookSlug}
        bookPublished={isBookPublished}
      />
      <PublishPanel
        published={published}
        saving={saving}
        error={error}
        onSaveDraft={() => save(false)}
        onPublish={() => save(true)}
        isExclusive={isExclusive}
        onExclusiveChange={setIsExclusive}
        price={price}
        onPriceChange={setPrice}
        bookTitle={bookTitle}
        onBookTitleChange={setBookTitle}
        onBookTitleCommit={handleBookTitleCommit}
        genre={genre}
        onGenreChange={handleGenreChange}
        tags={tags}
        onTagsChange={handleTagsChange}
      />
    </>
  );
}
