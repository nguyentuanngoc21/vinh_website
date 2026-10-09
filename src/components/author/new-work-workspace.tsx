"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChapterEditor } from "@/components/author/chapter-editor";
import { useTextHistory } from "@/components/author/use-text-history";
import { clearChapterDraft, readChapterDraft, writeChapterDraft, type ChapterDraft } from "@/lib/authoring/chapter-draft";
import { PublishPanel } from "@/components/author/publish-panel";
import { RequiredAgreementsModal } from "@/components/author/required-agreements-modal";
import type { BookGenre } from "@/lib/supabase/types";
import type { AgeRating } from "@/lib/age-rating";

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
// Truyện chưa có id — nháp trên máy dùng 1 khoá chung cho "tác phẩm mới".
const NEW_WORK_DRAFT_ID = "new-work";

export function NewWorkWorkspace() {
  const router = useRouter();

  const [bookTitle, setBookTitle] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [title, setTitle] = useState("");
  const history = useTextHistory("");
  const content = history.value;
  const [draftOffer, setDraftOffer] = useState<ChapterDraft | null>(null);
  const [draftChecked, setDraftChecked] = useState(false);
  const created = useRef(false);
  const [price, setPrice] = useState(0);
  const [audioUrl, setAudioUrl] = useState("");
  const [audioPrice, setAudioPrice] = useState(0);
  // Mặc định Tự do — chỉ độc quyền khi tác giả chủ động chọn.
  const [isExclusive, setIsExclusive] = useState(false);
  const [genre, setGenre] = useState<BookGenre | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [ageRating, setAgeRating] = useState<{ rating: AgeRating; warnings: string[] }>({ rating: "all", warnings: [] });
  const [isLastChapter, setIsLastChapter] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Server chặn tạo sách mới ở chế độ độc quyền (khi tác giả chọn Độc
  // quyền) khi chưa xác nhận Hợp đồng khai thác tác phẩm độc
  // quyền — 403 kèm missingAgreementIds, xem
  // src/lib/authoring/exclusivity-agreement.ts và author-workspace.tsx
  // (cùng pattern). Giữ lại `published` của lần bấm bị chặn để bấm lại
  // đúng hành động đó (Lưu nháp hoặc Xuất bản) sau khi đã xác nhận xong.
  const [missingAgreementIds, setMissingAgreementIds] = useState<string[] | null>(null);
  const [pendingPublished, setPendingPublished] = useState(false);

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
          synopsis,
          genre,
          tags,
          ageRating: ageRating.rating,
          contentWarnings: ageRating.warnings,
          isExclusive,
          chapterTitle: title,
          chapterContent: content,
          published,
          price,
          audioUrl: audioUrl.trim(),
          audioPrice,
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
      if (Array.isArray(data?.missingAgreementIds) && data.missingAgreementIds.length > 0) {
        setPendingPublished(published);
        setMissingAgreementIds(data.missingAgreementIds);
      } else {
        setError((data && typeof data.error === "string" && data.error) || "Không tạo được truyện. Vui lòng thử lại.");
      }
      setSaving(false);
      return;
    }

    created.current = true;
    clearChapterDraft(NEW_WORK_DRAFT_ID);
    router.replace(`/author/${data.bookId}/${data.chapterId}`);
    // Không setSaving(false) ở nhánh thành công — trang điều hướng đi
    // ngay, giữ saving=true để nút không nhấp nháy lại trong khoảnh khắc
    // chuyển trang (cùng lý do useCreateWork cũ đã làm trước khi bị bỏ).
  };

  // Nháp trên máy cho chương đầu tiên (chưa có trên máy chủ) — cùng cơ chế
  // author-workspace.tsx: hỏi khôi phục 1 lần, rồi ghi theo thay đổi.
  useEffect(() => {
    const timer = setTimeout(() => {
      const draft = readChapterDraft(NEW_WORK_DRAFT_ID);
      if (draft && (draft.title || draft.content.trim())) setDraftOffer(draft);
      setDraftChecked(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  const hasText = title.trim() !== "" || content.trim() !== "";
  useEffect(() => {
    if (!draftChecked || draftOffer || created.current) return;
    const timer = setTimeout(() => {
      if (hasText) writeChapterDraft(NEW_WORK_DRAFT_ID, { title, content, savedAt: Date.now(), baseVersion: 0 });
      else clearChapterDraft(NEW_WORK_DRAFT_ID);
    }, 800);
    return () => clearTimeout(timer);
  }, [draftChecked, draftOffer, hasText, title, content]);
  useEffect(() => {
    if (!hasText) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (created.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasText]);

  const notice = draftOffer ? (
    <div role="status" className="border-b border-cream-border bg-info-bg px-4 py-3 text-[13px] leading-[1.6] text-brand-ink lg:px-7">
      <p>
        <span className="font-semibold">Có bản viết chưa lưu trên máy này</span> (lúc{" "}
        {new Date(draftOffer.savedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}).
      </p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <button type="button" className="min-h-10 rounded-lg bg-brand-navy px-3 font-semibold text-white"
          onClick={() => {
            setTitle(draftOffer.title);
            history.set(draftOffer.content, { start: draftOffer.content.length, end: draftOffer.content.length }, "edit");
            setDraftOffer(null);
          }}>
          Khôi phục bản trên máy
        </button>
        <button type="button" className="min-h-10 rounded-lg border border-border-light bg-surface px-3 font-semibold text-brand-ink"
          onClick={() => { clearChapterDraft(NEW_WORK_DRAFT_ID); setDraftOffer(null); }}>
          Bỏ bản này
        </button>
      </div>
    </div>
  ) : null;

  return (
    <>
      <ChapterEditor
        bookTitle={bookTitle || "Tác phẩm mới"}
        title={title}
        onTitleChange={setTitle}
        content={content}
        onContentChange={history.set}
        onUndo={history.undo}
        onRedo={history.redo}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onSaveShortcut={() => void save(false)}
        saveStatus={hasText && !draftOffer ? { tone: "warn", label: "Chưa tạo truyện · đã giữ trên máy" } : null}
        notice={notice}
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
        audioUrl={audioUrl}
        onAudioUrlChange={setAudioUrl}
        audioPrice={audioPrice}
        onAudioPriceChange={setAudioPrice}
        bookTitle={bookTitle}
        onBookTitleChange={setBookTitle}
        onBookTitleCommit={() => {}}
        synopsis={synopsis}
        onSynopsisChange={setSynopsis}
        onSynopsisCommit={() => {}}
        genre={genre}
        onGenreChange={setGenre}
        tags={tags}
        onTagsChange={setTags}
        ageRating={ageRating.rating}
        contentWarnings={ageRating.warnings}
        onAgeRatingChange={(rating, warnings) => setAgeRating({ rating, warnings })}
      />
      {missingAgreementIds && (
        <RequiredAgreementsModal
          missingAgreementIds={missingAgreementIds}
          onClose={() => setMissingAgreementIds(null)}
          onAllAccepted={() => {
            setMissingAgreementIds(null);
            save(pendingPublished);
          }}
        />
      )}
    </>
  );
}
