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
};

type AuthorWorkspaceProps = {
  bookId: string;
  bookTitle: string;
  bookGenre: BookGenre | null;
  chapter: WorkspaceChapter;
};

/**
 * ChapterEditor (tiêu đề/nội dung chương) và PublishPanel (độc quyền/giá/
 * thể loại/nút lưu) cùng sửa 1 chương, nhưng là 2 Client Component tách
 * biệt (author/[bookId]/[chapterId]/page.tsx là Server Component, không
 * giữ được useState) — wrapper mỏng này giữ state chung, 2 component con
 * chỉ còn là UI thuần nhận props, không tự useState nội dung chương nữa.
 */
export function AuthorWorkspace({ bookId, bookTitle, bookGenre, chapter }: AuthorWorkspaceProps) {
  const [title, setTitle] = useState(chapter.title);
  const [content, setContent] = useState(chapter.content);
  const [published, setPublished] = useState(chapter.published);
  const [price, setPrice] = useState(chapter.price);
  const [isExclusive, setIsExclusive] = useState(chapter.is_exclusive);
  const [genre, setGenre] = useState<BookGenre | null>(bookGenre);
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

  return (
    <>
      <ChapterEditor
        bookTitle={bookTitle}
        title={title}
        onTitleChange={setTitle}
        content={content}
        onContentChange={setContent}
        savedAt={savedAt}
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
        genre={genre}
        onGenreChange={handleGenreChange}
      />
    </>
  );
}
