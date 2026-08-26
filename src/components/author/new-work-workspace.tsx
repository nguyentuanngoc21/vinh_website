"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChapterEditor } from "@/components/author/chapter-editor";
import { PublishPanel } from "@/components/author/publish-panel";
import type { BookGenre } from "@/lib/supabase/types";

/**
 * Trang "Tác phẩm mới" (/author/new) — KHÔNG ghi Supabase khi mở trang
 * này (khác trước đây: bấm "+ Tác phẩm mới" tạo ngay 1 book+chapter rỗng
 * trong DB dù chưa viết gì). Mọi state ở đây là local, chưa có
 * bookId/chapterId — genre/tags/title đổi chỉ setState, KHÔNG PATCH ngay
 * như author-workspace.tsx (không có gì để PATCH cả).
 *
 * Bấm "Lưu nháp"/"Xuất bản" LẦN ĐẦU mới thật sự gọi
 * POST /api/authoring/books với toàn bộ nội dung đã gõ, rồi
 * router.replace vào trang editor thật (/author/[bookId]/[chapterId]) —
 * replace (không push) để nút Back của trình duyệt không quay lại trang
 * rỗng này nữa.
 */
export function NewWorkWorkspace() {
  const router = useRouter();

  const [bookTitle, setBookTitle] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [price, setPrice] = useState(0);
  const [isExclusive, setIsExclusive] = useState(true);
  const [genre, setGenre] = useState<BookGenre | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [isLastChapter, setIsLastChapter] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (published: boolean) => {
    if (saving) return;
    setSaving(true);
    setError(null);

    let res: Response;
    try {
      res = await fetch("/api/authoring/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: bookTitle,
          genre,
          tags,
          isExclusive,
          chapterTitle: title,
          chapterContent: content,
          published,
          price,
          isLastChapter,
        }),
      });
    } catch {
      setError("Không thể kết nối máy chủ. Vui lòng thử lại sau.");
      setSaving(false);
      return;
    }

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.bookId || !data?.chapterId) {
      setError((data && typeof data.error === "string" && data.error) || "Không tạo được truyện. Vui lòng thử lại.");
      setSaving(false);
      return;
    }

    router.replace(`/author/${data.bookId}/${data.chapterId}`);
    // Không setSaving(false) ở nhánh thành công — trang điều hướng đi
    // ngay, giữ saving=true để nút không nhấp nháy lại trong khoảnh khắc
    // chuyển trang (cùng lý do useCreateWork cũ đã làm trước khi bị bỏ).
  };

  return (
    <>
      <ChapterEditor
        bookTitle={bookTitle || "Tác phẩm mới"}
        title={title}
        onTitleChange={setTitle}
        content={content}
        onContentChange={setContent}
        savedAt={null}
        isLastChapter={isLastChapter}
        onIsLastChapterToggle={() => setIsLastChapter((v) => !v)}
        isLastChapterLocked={false}
        bookSlug=""
        bookPublished={false}
      />
      <PublishPanel
        published={false}
        saving={saving}
        error={error}
        onSaveDraft={() => save(false)}
        onPublish={() => save(true)}
        isExclusive={isExclusive}
        onExclusiveChange={setIsExclusive}
        exclusiveLocked={false}
        exclusiveError={null}
        price={price}
        onPriceChange={setPrice}
        bookTitle={bookTitle}
        onBookTitleChange={setBookTitle}
        onBookTitleCommit={() => {}}
        genre={genre}
        onGenreChange={setGenre}
        tags={tags}
        onTagsChange={setTags}
      />
    </>
  );
}
