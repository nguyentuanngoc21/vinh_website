"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownIcon,
  ArrowSquareOutIcon,
  ArrowsDownUpIcon,
  ArrowUpIcon,
  CoinsIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { ImportManuscriptModal } from "@/components/author/import-manuscript-modal";
import { BookCoverUpload } from "@/components/author/book-cover-upload";
import { ShareManuscriptPanel, type ManuscriptGrant } from "@/components/author/share-manuscript-panel";
import { CharacterManager, type ManagedCharacter } from "@/components/author/character-manager";
import type { BookGenre } from "@/lib/supabase/types";

export type OverviewChapter = {
  id: string;
  title: string;
  order_index: number;
  published: boolean;
  price: number;
  is_last_chapter: boolean;
  /** Đang bị admin gỡ (chapters.removed_at). */
  removed: boolean;
  /** Chương nháp đã có giao dịch mua — không xoá được. */
  sold: boolean;
};

/** Cùng điều kiện với DELETE /api/authoring/chapters/[chapterId] (server vẫn là chốt chặn thật). */
function canDeleteChapter(c: OverviewChapter) {
  return !c.published && !c.removed && !c.is_last_chapter && !c.sold;
}

/** Đổi chỗ 1 chương lên/xuống; chương cuối luôn đứng cuối (RPC reorder_book_chapters cũng chặn). */
function moveChapter(list: OverviewChapter[], index: number, delta: -1 | 1) {
  const target = index + delta;
  if (target < 0 || target >= list.length) return null;
  if (list[index].is_last_chapter || list[target].is_last_chapter) return null;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

type BookOverviewProps = {
  bookId: string;
  bookTitle: string;
  bookSynopsis: string | null;
  bookGenre: BookGenre | null;
  bookSlug: string;
  bookPublished: boolean;
  bookIsExclusive: boolean;
  /** null = chưa gắn bìa thật, đã resolve sẵn từ page.tsx qua
   * resolveBookCoverUrl() — component này không tự query Supabase. */
  coverUrl: string | null;
  /** Đã order by order_index asc từ page.tsx. */
  chapters: OverviewChapter[];
  bookFinalized: boolean;
  initialManuscriptGrant: ManuscriptGrant | null;
  characters: ManagedCharacter[];
  /** Section "Cuộc thi" (BookContestSection) — dựng ở page.tsx (server). */
  contestSection?: React.ReactNode;
};

/**
 * Trang tổng quan 1 truyện — chưa từng có trước đây (sidebar chỉ link
 * thẳng vào chương mới nhất). Đây là nơi tác giả thấy toàn bộ danh sách
 * chương và là đích của luồng "Nhập bản thảo" khi thêm vào truyện có sẵn.
 */
export function BookOverview({
  bookId,
  bookTitle,
  bookSynopsis,
  bookGenre,
  bookSlug,
  bookPublished,
  bookIsExclusive,
  coverUrl,
  chapters,
  bookFinalized,
  initialManuscriptGrant,
  characters,
  contestSection,
}: BookOverviewProps) {
  const router = useRouter();
  const [creatingChapter, setCreatingChapter] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [synopsis, setSynopsis] = useState(bookSynopsis ?? "");
  const [editingSynopsis, setEditingSynopsis] = useState(false);
  const [synopsisDraft, setSynopsisDraft] = useState(synopsis);
  const [savingSynopsis, setSavingSynopsis] = useState(false);
  // Khác null khi đang ở chế độ sắp xếp — thứ tự tạm, chỉ lưu khi bấm "Lưu thứ tự".
  const [order, setOrder] = useState<OverviewChapter[] | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [deletingChapterId, setDeletingChapterId] = useState<string | null>(null);

  const latest = chapters[chapters.length - 1] ?? null;
  const publishedCount = chapters.filter((c) => c.published).length;

  // Chỉ để hiện/disable nút — server (DELETE route) là chốt chặn thật
  // (còn kiểm cả lịch sử giao dịch mua chương, việc client không biết).
  const canDelete = !bookPublished || !bookIsExclusive;

  const handleDelete = async () => {
    if (deleting || !canDelete) return;
    if (!window.confirm(`Xoá truyện "${bookTitle}"? Truyện sẽ ẩn khỏi danh sách của bạn.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/authoring/books/${bookId}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alert((data && typeof data.error === "string" && data.error) || "Không xoá được. Vui lòng thử lại.");
        setDeleting(false);
        return;
      }
      router.push("/author");
    } catch {
      alert("Không thể kết nối máy chủ. Vui lòng thử lại sau.");
      setDeleting(false);
    }
  };

  const handleNewChapter = async () => {
    if (creatingChapter) return;
    setCreatingChapter(true);
    const nextNo = (latest?.order_index ?? 0) + 1;

    try {
      const res = await fetch(`/api/authoring/books/${bookId}/chapters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapters: [{ title: `Chương ${nextNo}`, content: "" }] }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.chapterIds?.[0]) {
        alert((data && typeof data.error === "string" && data.error) || "Không tạo được chương. Vui lòng thử lại.");
        setCreatingChapter(false);
        return;
      }
      router.push(`/author/${bookId}/${data.chapterIds[0]}`);
    } catch {
      alert("Không thể kết nối máy chủ. Vui lòng thử lại sau.");
      setCreatingChapter(false);
    }
  };

  const handleDeleteChapter = async (chapter: OverviewChapter) => {
    if (deletingChapterId || !canDeleteChapter(chapter)) return;
    if (
      !window.confirm(
        `Xoá chương "${chapter.title}"? Chương nháp sẽ bị xoá hẳn, kèm bình luận và highlight của chương. Không hoàn tác được.`
      )
    )
      return;
    setDeletingChapterId(chapter.id);
    try {
      const res = await fetch(`/api/authoring/chapters/${chapter.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alert((data && typeof data.error === "string" && data.error) || "Không xoá được chương. Vui lòng thử lại.");
        return;
      }
      router.refresh();
    } catch {
      alert("Không thể kết nối máy chủ. Vui lòng thử lại sau.");
    } finally {
      setDeletingChapterId(null);
    }
  };

  const saveOrder = async () => {
    if (!order || savingOrder) return;
    setSavingOrder(true);
    try {
      const res = await fetch(`/api/authoring/books/${bookId}/chapters/order`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterIds: order.map((c) => c.id) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alert((data && typeof data.error === "string" && data.error) || "Không lưu được thứ tự. Vui lòng thử lại.");
        return;
      }
      setOrder(null);
      router.refresh();
    } catch {
      alert("Không thể kết nối máy chủ. Vui lòng thử lại sau.");
    } finally {
      setSavingOrder(false);
    }
  };

  const startEditSynopsis = () => {
    setSynopsisDraft(synopsis);
    setEditingSynopsis(true);
  };

  const cancelEditSynopsis = () => {
    setEditingSynopsis(false);
  };

  const saveSynopsis = async () => {
    if (savingSynopsis) return;
    setSavingSynopsis(true);
    const trimmed = synopsisDraft.trim();
    try {
      const res = await fetch(`/api/authoring/books/${bookId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ synopsis: trimmed }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alert((data && typeof data.error === "string" && data.error) || "Không lưu được. Vui lòng thử lại.");
        setSavingSynopsis(false);
        return;
      }
      setSynopsis(trimmed);
      setEditingSynopsis(false);
      setSavingSynopsis(false);
    } catch {
      alert("Không thể kết nối máy chủ. Vui lòng thử lại sau.");
      setSavingSynopsis(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col bg-[#FBF8F1] px-4 py-5 lg:col-span-2 lg:overflow-y-auto lg:px-9 lg:py-7">
      <div className="mb-1 flex flex-wrap items-center gap-2.5">
        {bookGenre && (
          <span className="rounded-full bg-neutral-bg px-3 py-1 text-xs font-medium text-ink">{bookGenre}</span>
        )}
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            bookPublished ? "bg-[#E4F1EA] text-[#256B4C]" : "bg-cream-card-alt text-stone-dark"
          }`}
        >
          {bookPublished ? "Đang ra" : "Bản nháp"}
        </span>
        {bookPublished && (
          <Link
            href={`/truyen/${bookSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[12.5px] font-semibold text-brand-gold-dark no-underline transition-colors hover:text-brand-ink"
          >
            Xem trang truyện <ArrowSquareOutIcon size={13} />
          </Link>
        )}
      </div>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="flex min-w-0 items-end gap-4">
          <BookCoverUpload bookId={bookId} bookTitle={bookTitle} bookGenre={bookGenre} coverUrl={coverUrl} />
          <div className="min-w-0">
            <div className="break-words font-[family-name:var(--font-lora)] text-2xl font-bold text-brand-ink sm:text-[27px]">
              {bookTitle}
            </div>
            <div className="mt-1 text-[13.5px] text-stone-alt">
              {chapters.length} chương · {publishedCount} đã đăng
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={handleDelete}
            disabled={!canDelete || deleting}
            title={
              !canDelete
                ? "Không thể xoá tác phẩm đã xuất bản ở dạng độc quyền — chuyển sang tự do trước, hoặc liên hệ quản trị viên."
                : undefined
            }
            className="flex items-center gap-1.5 rounded-[9px] border border-[#f3c6c6] bg-white px-4 py-2.5 text-[13.5px] font-semibold text-[#B02A37] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <TrashIcon size={16} /> {deleting ? "Đang xoá…" : "Xoá truyện"}
          </button>
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 rounded-[9px] border border-cream-border bg-white px-4 py-2.5 text-[13.5px] font-semibold text-brand-ink"
          >
            <UploadSimpleIcon size={16} /> Nhập bản thảo
          </button>
          <button
            type="button"
            onClick={handleNewChapter}
            disabled={creatingChapter}
            className="flex items-center gap-1.5 rounded-[9px] bg-brand-gold px-4 py-2.5 text-[13.5px] font-bold text-brand-ink disabled:cursor-default disabled:opacity-60"
          >
            <PlusIcon size={16} weight="fill" /> {creatingChapter ? "Đang tạo…" : "Chương mới"}
          </button>
        </div>
      </div>

      <div className="mb-6 rounded-[12px] border border-cream-border bg-white p-5">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <div className="text-xs font-bold tracking-wide text-stone-alt">TÓM TẮT</div>
          {!editingSynopsis && (
            <button
              type="button"
              onClick={startEditSynopsis}
              className="flex items-center gap-1 text-[12.5px] font-semibold text-brand-gold-dark transition-colors hover:text-brand-ink"
            >
              <PencilSimpleIcon size={14} weight="bold" /> Sửa
            </button>
          )}
        </div>

        {editingSynopsis ? (
          <div>
            <textarea
              value={synopsisDraft}
              onChange={(e) => setSynopsisDraft(e.target.value)}
              placeholder="Vài dòng giới thiệu nội dung truyện cho độc giả…"
              rows={4}
              autoFocus
              className="w-full resize-none rounded-lg border border-cream-border px-3 py-2.5 text-sm text-brand-ink outline-none focus:border-brand-ink"
            />
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={saveSynopsis}
                disabled={savingSynopsis}
                className="cursor-pointer rounded-[9px] bg-brand-gold px-4 py-2 text-[13px] font-bold text-brand-ink transition-opacity disabled:cursor-default disabled:opacity-60"
              >
                {savingSynopsis ? "Đang lưu…" : "Lưu"}
              </button>
              <button
                type="button"
                onClick={cancelEditSynopsis}
                disabled={savingSynopsis}
                className="cursor-pointer rounded-[9px] border border-cream-border bg-white px-4 py-2 text-[13px] font-semibold text-brand-ink transition-opacity disabled:cursor-default disabled:opacity-60"
              >
                Hủy
              </button>
            </div>
          </div>
        ) : synopsis ? (
          <p className="whitespace-pre-line text-[13.5px] leading-[1.7] text-ink">{synopsis}</p>
        ) : (
          <p className="text-[13.5px] italic text-stone-light">Bạn chưa cập nhật mô tả truyện</p>
        )}
      </div>

      {contestSection}

      <ShareManuscriptPanel bookId={bookId} finalized={bookFinalized} initialGrant={initialManuscriptGrant} />

      <CharacterManager bookId={bookId} initialCharacters={characters} />

      {latest && (
        <Link
          href={`/author/${bookId}/${latest.id}`}
          className="mb-6 flex items-center justify-between rounded-[12px] border border-cream-border bg-white px-5 py-3.5 no-underline transition-colors hover:border-brand-gold"
        >
          <div className="min-w-0">
            <div className="text-xs font-semibold tracking-wide text-stone-alt">TIẾP TỤC VIẾT</div>
            <div className="mt-0.5 truncate text-[14.5px] font-semibold text-brand-ink">
              {latest.order_index}. {latest.title}
            </div>
          </div>
        </Link>
      )}

      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-bold tracking-wide text-stone-alt">DANH SÁCH CHƯƠNG</div>
        {order ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={saveOrder}
              disabled={savingOrder}
              className="min-h-10 rounded-[9px] bg-brand-gold px-4 py-2 text-[13px] font-bold text-brand-ink disabled:cursor-default disabled:opacity-60"
            >
              {savingOrder ? "Đang lưu…" : "Lưu thứ tự"}
            </button>
            <button
              type="button"
              onClick={() => setOrder(null)}
              disabled={savingOrder}
              className="min-h-10 rounded-[9px] border border-cream-border bg-white px-4 py-2 text-[13px] font-semibold text-brand-ink disabled:cursor-default disabled:opacity-60"
            >
              Hủy
            </button>
          </div>
        ) : (
          chapters.length > 1 && (
            <button
              type="button"
              onClick={() => setOrder(chapters)}
              className="flex min-h-10 items-center gap-1.5 text-[12.5px] font-semibold text-brand-gold-dark transition-colors hover:text-brand-ink"
            >
              <ArrowsDownUpIcon size={14} weight="bold" /> Sắp xếp chương
            </button>
          )
        )}
      </div>

      <div className="overflow-hidden rounded-[12px] border border-cream-border bg-white">
        {/* Header cột chỉ có ý nghĩa ở layout lưới (sm:+) — trên điện thoại
            mỗi chương đã hiển thị dạng thẻ 2 dòng tự giải thích. */}
        <div className="hidden border-b border-cream-border bg-cream-card py-2.5 pl-4 pr-2 text-[10.5px] font-bold tracking-wide text-stone-alt sm:flex sm:items-center">
          <div className="grid flex-1 grid-cols-[40px_1fr_100px_90px] gap-3">
            <span />
            <span>CHƯƠNG</span>
            <span>TRẠNG THÁI</span>
            <span>GIÁ</span>
          </div>
          <span className="w-[88px]" />
        </div>
        {(order ?? chapters).map((c, i, list) => {
          const content = (
            <>
              {/* sm:contents — bỏ 2 div bọc khỏi box model từ sm trở lên, để
                  4 <span> bên trong thành item trực tiếp của grid 4 cột;
                  dưới sm chúng chỉ là 2 dòng flex thường. */}
              <div className="flex min-w-0 items-center gap-2 sm:contents">
                <span className="shrink-0 text-[11.5px] font-bold text-stone-alt">{order ? i + 1 : c.order_index}</span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-brand-ink sm:flex-none">
                  {c.title}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2.5 sm:contents">
                <span
                  className={`w-fit rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${
                    c.removed
                      ? "bg-error-bg text-error"
                      : c.published
                        ? "bg-success-form-bg text-success-form"
                        : "bg-cream-card-alt text-stone-dark"
                  }`}
                >
                  {c.removed ? "Bị gỡ" : c.published ? "Đã đăng" : "Bản nháp"}
                  {c.is_last_chapter ? " · Cuối" : ""}
                </span>
                <span className="flex items-center gap-1 text-[13px] font-semibold text-stone-dark">
                  {c.price > 0 ? (
                    <>
                      <CoinsIcon size={13} color="var(--color-brand-gold)" /> {c.price}
                    </>
                  ) : (
                    "Miễn phí"
                  )}
                </span>
              </div>
            </>
          );
          const rowGrid =
            "flex min-w-0 flex-1 flex-col gap-1.5 py-3 pl-4 sm:grid sm:grid-cols-[40px_1fr_100px_90px] sm:items-center sm:gap-3";
          const canUp = !!order && !!moveChapter(list, i, -1);
          const canDown = !!order && !!moveChapter(list, i, 1);
          return (
            <div key={c.id} className="flex items-center gap-1 border-b border-cream-card-alt pr-2 last:border-b-0">
              {order ? (
                <div className={rowGrid}>{content}</div>
              ) : (
                <Link
                  href={`/author/${bookId}/${c.id}`}
                  className={`${rowGrid} no-underline transition-colors hover:bg-cream-card`}
                >
                  {content}
                </Link>
              )}
              <div className="flex w-[88px] shrink-0 justify-end gap-1">
                {order ? (
                  <>
                    <button
                      type="button"
                      aria-label={`Đưa "${c.title}" lên`}
                      onClick={() => setOrder(moveChapter(list, i, -1) ?? list)}
                      disabled={!canUp || savingOrder}
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-cream-border text-brand-ink disabled:opacity-30"
                    >
                      <ArrowUpIcon size={16} weight="bold" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Đưa "${c.title}" xuống`}
                      onClick={() => setOrder(moveChapter(list, i, 1) ?? list)}
                      disabled={!canDown || savingOrder}
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-cream-border text-brand-ink disabled:opacity-30"
                    >
                      <ArrowDownIcon size={16} weight="bold" />
                    </button>
                  </>
                ) : (
                  canDeleteChapter(c) && (
                    <button
                      type="button"
                      aria-label={`Xoá "${c.title}"`}
                      title="Xoá chương nháp"
                      onClick={() => handleDeleteChapter(c)}
                      disabled={!!deletingChapterId}
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-error transition-colors hover:bg-error-bg disabled:opacity-40"
                    >
                      <TrashIcon size={16} />
                    </button>
                  )
                )}
              </div>
            </div>
          );
        })}
        {chapters.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-stone-light">Chưa có chương nào.</div>
        )}
      </div>
      <p className="mb-6 mt-2 text-[12px] text-stone-alt">
        Chỉ xoá được chương nháp chưa có người mua và chưa đánh dấu chương cuối. Chương cuối luôn đứng cuối.
      </p>

      <ImportManuscriptModal
        open={showImport}
        onClose={() => setShowImport(false)}
        books={[]}
        destinationBookId={bookId}
      />
    </div>
  );
}
